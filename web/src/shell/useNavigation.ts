import { filterNavigationByAccess } from '@legacy/apis/accessControl.js';
import { NAVIGATION_STRUCTURE } from '@legacy/navigationStructure.js';
import { notifications } from '@mantine/notifications';
import { useCallback, useMemo } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { useAppNavigate } from './AppLink';
import { isUnbuiltGeneralPage } from './navModel';

/** The menu tree this user may see, plus the click handler both navbars use. */
export function useNavigation() {
  const { permissionsVersion } = useAuth();
  const navigate = useAppNavigate();

  const tree = useMemo(
    () => filterNavigationByAccess(NAVIGATION_STRUCTURE),
    // Recompute when the permission payload changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [permissionsVersion],
  );

  const open = useCallback(
    (path: string) => {
      if (isUnbuiltGeneralPage(path)) {
        notifications.show({ color: 'yellow', message: `Bu sayfa henüz geliştirilme aşamasında: ${path}` });
        return;
      }
      navigate(path);
    },
    [navigate],
  );

  return { tree, open };
}
