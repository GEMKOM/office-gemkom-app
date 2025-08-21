/**
 * Statistics Cards Component
 * A reusable component for displaying statistics cards with customizable content
 */

export class StatisticsCards {
    constructor(containerId, options = {}) {
        this.containerId = containerId;
        this.container = document.getElementById(containerId);
        this.options = {
            cards: [],
            layout: 'grid', // 'grid' or 'flex'
            responsive: true,
            compact: true,
            animation: true,
            ...options
        };
        
        this.init();
    }

    init() {
        if (!this.container) {
            console.error(`StatisticsCards: Container with id '${this.containerId}' not found`);
            return;
        }
        
        this.render();
        if (this.options.animation) {
            this.animateCards();
        }
    }

    /**
     * Set or update the cards data
     * @param {Array} cards - Array of card objects
     */
    setCards(cards) {
        this.options.cards = cards;
        this.render();
        if (this.options.animation) {
            this.animateCards();
        }
    }

    /**
     * Add a single card
     * @param {Object} card - Card object
     */
    addCard(card) {
        this.options.cards.push(card);
        this.render();
    }

    /**
     * Remove a card by index
     * @param {number} index - Index of card to remove
     */
    removeCard(index) {
        if (index >= 0 && index < this.options.cards.length) {
            this.options.cards.splice(index, 1);
            this.render();
        }
    }

    /**
     * Update a specific card
     * @param {number} index - Index of card to update
     * @param {Object} cardData - New card data
     */
    updateCard(index, cardData) {
        if (index >= 0 && index < this.options.cards.length) {
            this.options.cards[index] = { ...this.options.cards[index], ...cardData };
            this.render();
        }
    }

    /**
     * Update all card values
     * @param {Object} values - Object with card indices as keys and new values
     */
    updateValues(values) {
        Object.keys(values).forEach(index => {
            const cardIndex = parseInt(index);
            if (cardIndex >= 0 && cardIndex < this.options.cards.length) {
                this.options.cards[cardIndex].value = values[index];
            }
        });
        this.render();
    }

    /**
     * Render the statistics cards
     */
    render() {
        if (!this.container) return;

        const cardsHtml = this.options.cards.map((card, index) => {
            return this.createCardHtml(card, index);
        }).join('');

        const layoutClass = this.options.layout === 'flex' ? 'd-flex flex-wrap' : 'row g-3';
        const responsiveClass = this.options.responsive ? 'col-lg-3 col-md-6' : 'col';
        
        this.container.innerHTML = `
            <div class="${layoutClass} mb-3">
                ${this.options.layout === 'grid' 
                    ? this.options.cards.map((card, index) => `
                        <div class="${responsiveClass}">
                            ${this.createCardHtml(card, index)}
                        </div>
                    `).join('')
                    : cardsHtml
                }
            </div>
        `;
    }

    /**
     * Create HTML for a single card
     * @param {Object} card - Card data
     * @param {number} index - Card index
     * @returns {string} HTML string
     */
    createCardHtml(card, index) {
        const {
            title = '',
            value = '0',
            icon = 'fas fa-chart-bar',
            color = 'primary',
            bgColor = null,
            textColor = null,
            compact = this.options.compact,
            id = `stat-card-${index}`,
            onClick = null,
            tooltip = null
        } = card;

        const cardClass = `stat-card ${compact ? 'compact' : ''}`;
        const clickAttr = onClick ? `onclick="${onClick}"` : '';
        const tooltipAttr = tooltip ? `title="${tooltip}" data-bs-toggle="tooltip"` : '';
        const customStyle = bgColor || textColor ? 
            `style="${bgColor ? `background: ${bgColor};` : ''} ${textColor ? `color: ${textColor};` : ''}"` : '';

        return `
            <div class="${cardClass}" id="${id}" ${clickAttr} ${tooltipAttr} ${customStyle}>
                <div class="stat-card-body">
                    <div class="stat-icon bg-${color}">
                        <i class="${icon}"></i>
                    </div>
                    <div class="stat-content">
                        <h4 class="stat-number">${value}</h4>
                        <p class="stat-label small">${title}</p>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Animate cards with staggered entrance
     */
    animateCards() {
        const cards = this.container.querySelectorAll('.stat-card');
        cards.forEach((card, index) => {
            card.style.opacity = '0';
            card.style.transform = 'translateY(20px)';
            
            setTimeout(() => {
                card.style.transition = 'all 0.5s ease';
                card.style.opacity = '1';
                card.style.transform = 'translateY(0)';
            }, index * 100);
        });
    }

    /**
     * Show loading state
     */
    showLoading() {
        this.container.innerHTML = `
            <div class="row g-3 mb-3">
                <div class="col-12 text-center">
                    <div class="loading-spinner">
                        <div class="spinner-border text-primary" role="status">
                            <span class="visually-hidden">Loading...</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Show empty state
     */
    showEmpty(message = 'No statistics available') {
        this.container.innerHTML = `
            <div class="row g-3 mb-3">
                <div class="col-12 text-center">
                    <div class="empty-state">
                        <i class="fas fa-chart-line text-muted"></i>
                        <p class="text-muted">${message}</p>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Destroy the component
     */
    destroy() {
        if (this.container) {
            this.container.innerHTML = '';
        }
    }
}