class OvertimeRequestViewSet(viewsets.ModelViewSet):
    """
    Endpoints:
      - GET  /overtime/requests/                   (list)
      - POST /overtime/requests/                   (create)
      - GET  /overtime/requests/{id}/              (detail)
      - PATCH/PUT /overtime/requests/{id}/         (update reason while submitted)
      - POST /overtime/requests/{id}/cancel/       (cancel if submitted)
      - POST /overtime/requests/{id}/approve/      (approve current stage — approvers only)
      - POST /overtime/requests/{id}/reject/       (reject  current stage — approvers only)
      - GET  /overtime/requests/pending-approvals/ (your approval inbox)
    """
    permission_classes = [IsAuthenticated & IsRequesterOrAdmin]
    filter_backends = [DjangoFilterBackend, OrderingFilter, SearchFilter]
    filterset_class = OvertimeRequestFilter
    ordering = ["-created_at"]
    ordering_fields = ["start_at", "end_at", "status", "created_at"]
    search_fields = ["reason", "entries__job_no", "entries__description"]

    # --- Allow approvers (non-requesters) to hit approve/reject/inbox
    def get_permissions(self):
        # These actions: only need to be logged in (approvers who aren’t requesters)
        if self.action in ["approve", "reject", "pending_approvals"]:
            return [IsAuthenticated()]
        # Everything else: must be authenticated AND requester/admin
        return [IsAuthenticated(), IsRequesterOrAdmin()]

    def get_queryset(self):
        user = self.request.user
        qs = (OvertimeRequest.objects
              .select_related("requester")
              .prefetch_related(
                  Prefetch("entries", queryset=OvertimeEntry.objects.select_related("user"))
              ))
        if getattr(user, "is_admin", False) or getattr(user, "is_superuser", False):
            return qs.distinct()
        # Non-admin: requester or included as entry user
        return qs.filter(Q(requester=user) | Q(entries__user=user)).distinct()

    def get_serializer_class(self):
        if self.action == "create":
            return OvertimeRequestCreateSerializer
        elif self.action in ["update", "partial_update"]:
            return OvertimeRequestUpdateSerializer
        elif self.action == "list":
            return OvertimeRequestListSerializer
        return OvertimeRequestDetailSerializer

    def perform_create(self, serializer):
        obj = serializer.save()
        # serializer already calls send_for_approval(); keep here if you moved it.

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        obj: OvertimeRequest = self.get_object()
        if obj.status != "submitted":
            return Response({"detail": "Only 'submitted' requests can be cancelled."}, status=400)
        obj.status = "cancelled"
        obj.save(update_fields=["status", "updated_at"])
        return Response({"detail": "Request cancelled."}, status=200)

    # ---------- Approvals: Approve / Reject (detail actions) ----------

    def _get_current_stage_for_user(self, ot: OvertimeRequest, user):
        """Fetch current stage and verify `user` is among approvers."""
        ct = ContentType.objects.get_for_model(OvertimeRequest)
        try:
            wf = ApprovalWorkflow.objects.get(content_type=ct, object_id=ot.id)
        except ApprovalWorkflow.DoesNotExist:
            return None, None, "no_workflow"

        stage = (ApprovalStageInstance.objects
                 .filter(workflow=wf,
                         order=wf.current_stage_order,
                         is_complete=False,
                         is_rejected=False)
                 .first())
        if not stage:
            return wf, None, "no_open_stage"

        approver_ids = stage.approver_user_ids or []
        if user.id in approver_ids or getattr(user, "is_superuser", False) or getattr(user, "is_admin", False):
            return wf, stage, "ok"
        return wf, stage, "forbidden"

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        ot: OvertimeRequest = self.get_object()
        wf, stage, state = self._get_current_stage_for_user(ot, request.user)
        if state == "no_workflow":
            return Response({"detail": "No approval workflow found."}, status=404)
        if state == "no_open_stage":
            return Response({"detail": "No pending stage to approve."}, status=400)
        if state == "forbidden":
            return Response({"detail": "You are not an approver for the current stage."}, status=403)

        comment = (request.data or {}).get("comment", "")
        wf = ot_decide(ot, request.user, approve=True, comment=comment)
        return Response({"detail": "Approved.", "status": ot.status})

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        ot: OvertimeRequest = self.get_object()
        wf, stage, state = self._get_current_stage_for_user(ot, request.user)
        if state == "no_workflow":
            return Response({"detail": "No approval workflow found."}, status=404)
        if state == "no_open_stage":
            return Response({"detail": "No pending stage to reject."}, status=400)
        if state == "forbidden":
            return Response({"detail": "You are not an approver for the current stage."}, status=403)

        comment = (request.data or {}).get("comment", "")
        wf = ot_decide(ot, request.user, approve=False, comment=comment)
        return Response({"detail": "Rejected.", "status": ot.status})

    # ---------- Inbox: pending approvals for the current user ----------
    @action(detail=False, methods=["get"], url_path="pending-approvals")
    def pending_approvals(self, request):
        """
        Returns OvertimeRequests where the caller is in the CURRENT stage approvers.
        """
        user = request.user
        ct = ContentType.objects.get_for_model(OvertimeRequest)
        stages = (ApprovalStageInstance.objects
                  .filter(
                      workflow__content_type=ct,
                      workflow__is_complete=False,
                      workflow__is_rejected=False,
                      workflow__current_stage_order=F("order"),
                      is_complete=False,
                      is_rejected=False,
                      approver_user_ids__contains=[user.id],   # Postgres JSONB containment
                  )
                  .select_related("workflow")
                  .order_by("-id"))

        ot_ids = [s.workflow.object_id for s in stages]
        # keep list ordering by stages (optional)
        qs = (OvertimeRequest.objects
              .filter(id__in=ot_ids)
              .select_related("requester")
              .prefetch_related("entries"))

        # Map stage meta (name/order) onto each OT in the response
        stage_map = {s.workflow.object_id: {"order": s.order, "name": s.name} for s in stages}

        data = []
        for ot in qs:
            st = stage_map.get(ot.id, {"order": None, "name": None})
            data.append({
                "id": ot.id,
                "status": ot.status,
                "start_at": ot.start_at,
                "end_at": ot.end_at,
                "duration_hours": ot.duration_hours,
                "team": ot.team,
                "reason": ot.reason,
                "requester": getattr(ot.requester, "username", None),
                "current_stage_order": st["order"],
                "current_stage_name": st["name"],
                "url": f"/overtime/requests/{ot.id}/",  # frontend can link to detail
            })
        return Response(data, status=200)

# overtime/models.py
from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models, transaction
from django.utils import timezone

from django.contrib.contenttypes.fields import GenericRelation
from django.contrib.contenttypes.models import ContentType

# approvals imports
from approvals.models import (
    ApprovalWorkflow,
    ApprovalStage,
    ApprovalStageInstance,
    ApprovalPolicy,
)

User = settings.AUTH_USER_MODEL


class OvertimeRequest(models.Model):
    STATUS_CHOICES = [
        ("submitted", "Onay Bekliyor"),
        ("approved", "Onaylandı"),
        ("rejected", "Reddedildi"),
        ("cancelled", "İptal Edildi"),
    ]

    requester = models.ForeignKey(User, on_delete=models.PROTECT, related_name="overtime_requests")
    team = models.CharField(max_length=50, blank=True)  # snapshot of requester.profile.team
    reason = models.TextField(blank=True)

    start_at = models.DateTimeField()
    end_at = models.DateTimeField()

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="submitted")
    duration_hours = models.DecimalField(max_digits=7, decimal_places=2, default=0)

    # Link to approvals
    approvals = GenericRelation(ApprovalWorkflow, related_query_name="overtime_request")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["start_at"]),
            models.Index(fields=["end_at"]),
            models.Index(fields=["status"]),
            models.Index(fields=["requester"]),
            models.Index(fields=["team"]),
        ]

    def __str__(self):
        return f"OT #{self.pk} | {self.start_at} → {self.end_at} | {self.status}"

    def clean(self):
        if self.end_at <= self.start_at:
            raise ValidationError("end_at must be after start_at.")

    def compute_duration_hours(self):
        delta = self.end_at - self.start_at
        return round(delta.total_seconds() / 3600, 2)

    def save(self, *args, **kwargs):
        self.duration_hours = self.compute_duration_hours()
        super().save(*args, **kwargs)

    # ===== Approval wiring =====

    def _select_policy(self) -> ApprovalPolicy | None:
        """
        Choose an ApprovalPolicy for this overtime request.
        Adjust rules as you like. Example rules:
        - Use is_rolling_mill when team == 'rollingmill'
        - Only active policies
        - Lowest selection_priority wins
        """
        qs = ApprovalPolicy.objects.filter(is_active=True)

        # Example mapping for your earlier pattern (you used is_rolling_mill in PR approvals):
        if (self.team or "").lower() in {"rollingmill", "haddehane"}:
            qs = qs.filter(is_rolling_mill=True)
        else:
            qs = qs.filter(is_rolling_mill=False)

        # If you want to drive by "priority_in", you can store "overtime" or team names there
        # and add an extra filter like:
        # qs = qs.filter(Q(priority_in__len=0) | Q(priority_in__contains=["overtime"]))

        return qs.order_by("selection_priority").first()

    def _snapshot_for_workflow(self) -> dict:
        """
        Persist enough data so approvers see context even if things change later.
        """
        return {
            "overtime": {
                "id": self.pk,
                "requester_id": self.requester_id,
                "team": self.team,
                "reason": self.reason,
                "start_at": self.start_at.isoformat(),
                "end_at": self.end_at.isoformat(),
                "duration_hours": str(self.duration_hours),
                "entries": [
                    {
                        "id": e.id,
                        "user_id": e.user_id,
                        "job_no": e.job_no,
                        "description": e.description,
                    }
                    for e in self.entries.all()
                ],
            }
        }

    @transaction.atomic
    def send_for_approval(self):
        from overtime.approval_service import submit_overtime_request
        return submit_overtime_request(self, by_user=self.requester)

    # This is the callback the approvals system should call when state changes
    def handle_approval_event(self, *, workflow: ApprovalWorkflow, event: str, payload: dict | None = None):
        """
        Contract for approvals app:
          subject.handle_approval_event(workflow=..., event='approved'/'rejected'/'stage_advanced'/'cancelled', payload={...})

        On final approval -> mark OT 'approved'
        On rejection     -> mark OT 'rejected'
        On cancellation  -> mark OT 'cancelled'
        On stage advance -> no status change
        """
        if event == "approved":
            if self.status != "approved":
                self.status = "approved"
                self.save(update_fields=["status", "updated_at"])
        elif event == "rejected":
            if self.status != "rejected":
                self.status = "rejected"
                self.save(update_fields=["status", "updated_at"])
        elif event == "cancelled":
            if self.status != "cancelled":
                self.status = "cancelled"
                self.save(update_fields=["status", "updated_at"])
        elif event == "stage_advanced":
            # you may want to notify requester; leave DB unchanged
            pass
        else:
            # unknown event – no-op
            pass


class OvertimeEntry(models.Model):
    request = models.ForeignKey(OvertimeRequest, on_delete=models.CASCADE, related_name="entries")
    user = models.ForeignKey(User, on_delete=models.PROTECT, related_name="overtime_entries")
    job_no = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    approved_hours = models.DecimalField(max_digits=7, decimal_places=2, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["id"]
        indexes = [
            models.Index(fields=["user"]),
            models.Index(fields=["request", "user"]),
        ]

    def __str__(self):
        return f"OT Entry #{self.pk} | {self.user} | {self.job_no}"


# overtime/serializers.py
from django.utils import timezone
from django.db.models import Q
from rest_framework import serializers
from django.contrib.auth import get_user_model

from users.models import UserProfile

from .models import OvertimeRequest, OvertimeEntry

User = get_user_model()
TEAM_LABELS = dict(UserProfile._meta.get_field("team").choices)

class OvertimeEntryReadSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(source="user.id", read_only=True)
    user_username = serializers.CharField(source="user.username", read_only=True)
    user_full_name = serializers.SerializerMethodField()

    class Meta:
        model = OvertimeEntry
        fields = ["id", "user_id", "user_username", "user_full_name", "job_no", "description", "approved_hours", "created_at"]

    def get_user_full_name(self, obj):
        return getattr(obj.user, "get_full_name", lambda: "")() or obj.user.username


class OvertimeEntryWriteSerializer(serializers.ModelSerializer):
    user = serializers.PrimaryKeyRelatedField(queryset=User.objects.all())

    class Meta:
        model = OvertimeEntry
        fields = ["user", "job_no", "description"]


class OvertimeRequestListSerializer(serializers.ModelSerializer):
    requester_username = serializers.CharField(source="requester.username", read_only=True)
    total_users = serializers.IntegerField(source="entries.count", read_only=True)
    status_label = serializers.SerializerMethodField()
    team_label = serializers.SerializerMethodField()

    def get_status_label(self, obj):
        return obj.get_status_display()
    
    def get_team_label(self, obj):
        return TEAM_LABELS.get(obj.team, obj.team or "")

    class Meta:
        model = OvertimeRequest
        fields = [
            "id", "status", "status_label", "start_at", "end_at", "duration_hours",
            "requester", "requester_username", "team", "team_label", "total_users", "created_at",
        ]


class OvertimeRequestDetailSerializer(serializers.ModelSerializer):
    requester_username = serializers.CharField(source="requester.username", read_only=True)
    entries = OvertimeEntryReadSerializer(many=True, read_only=True)

    class Meta:
        model = OvertimeRequest
        fields = [
            "id", "status", "start_at", "end_at", "duration_hours",
            "requester", "requester_username", "team", "reason",
            "entries", "created_at", "updated_at",
        ]


class OvertimeRequestCreateSerializer(serializers.ModelSerializer):
    """
    Create payload includes:
    - start_at, end_at
    - reason (optional)
    - entries: [{user: <id>, job_no: "...", description: "..."}, ...]
    """
    entries = OvertimeEntryWriteSerializer(many=True)

    class Meta:
        model = OvertimeRequest
        fields = ["start_at", "end_at", "reason", "entries"]

    def validate(self, data):
        start_at = data["start_at"]
        end_at = data["end_at"]
        if end_at <= start_at:
            raise serializers.ValidationError("end_at must be after start_at.")
        return data

    def _validate_overlaps(self, *, requester, start_at, end_at, entries_users, instance=None):
        """
        Disallow overlapping open/approved requests for the same user & time range.
        """
        qs = OvertimeRequest.objects.filter(
            status__in=["submitted", "approved"],
            entries__user__in=entries_users,
        ).distinct()

        if instance:
            qs = qs.exclude(pk=instance.pk)

        # overlap condition: existing.start < new.end AND existing.end > new.start
        qs = qs.filter(Q(start_at__lt=end_at) & Q(end_at__gt=start_at))
        if qs.exists():
            raise serializers.ValidationError("One or more selected users already have an overlapping overtime request in this time range.")

    def create(self, validated_data):
        request = self.context["request"]
        requester = request.user

        entries_data = validated_data.pop("entries")
        start_at = validated_data["start_at"]
        end_at = validated_data["end_at"]

        # Snapshot team from profile if available
        team = getattr(getattr(requester, "profile", None), "team", "") or ""

        # Validate overlaps before creating
        users = [row["user"] for row in entries_data]
        self._validate_overlaps(requester=requester, start_at=start_at, end_at=end_at, entries_users=users)

        ot = OvertimeRequest.objects.create(requester=requester, team=team, **validated_data)
        OvertimeEntry.objects.bulk_create([
            OvertimeEntry(request=ot, user=row["user"], job_no=row["job_no"], description=row.get("description", ""))
            for row in entries_data
        ])

        # Fire approval hook (no-op for now)
        ot.send_for_approval()

        return ot


class OvertimeRequestUpdateSerializer(serializers.ModelSerializer):
    """
    Allow requester to update reason while 'submitted'.
    (Editing time range or entries is typically disallowed after submission;
     if you want edits, you can expand here with extra checks.)
    """
    class Meta:
        model = OvertimeRequest
        fields = ["reason"]

    def validate(self, attrs):
        obj: OvertimeRequest = self.instance
        if obj.status != "submitted":
            raise serializers.ValidationError("Only 'submitted' requests can be edited.")
        return attrs
