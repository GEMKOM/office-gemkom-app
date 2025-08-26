export class MenuComponent {
    constructor(containerId, options = {}) {
        this.containerId = containerId;
        this.options = {
            title: 'Modül',
            subtitle: 'Modül açıklaması',
            cards: [],
            ...options
        };
    }

    render() {
        const container = document.getElementById(this.containerId);
        if (!container) {
            console.error(`Container with id "${this.containerId}" not found`);
            return;
        }

        const html = this.generateHTML();
        container.innerHTML = html;
        
        // After rendering, calculate and apply consistent heights
        this.applyConsistentHeights();
    }

    generateHTML() {
        const { title, subtitle, cards } = this.options;
        
        // Calculate column classes based on number of cards
        const columnClasses = this.getColumnClasses(cards.length);

        const cardsHTML = cards.map((card, index) => {
            const columnClass = columnClasses[index] || 'col-md-6 col-lg-3';
            return this.generateCardHTML(card, columnClass);
        }).join('');

        return `
            <!-- Header Section -->
            <section class="modules-section py-5">
                <div class="container">
                    <div class="row">
                        <div class="col-12 text-center mb-5">
                            <h2 class="section-title">${title}</h2>
                            <p class="section-subtitle">${subtitle}</p>
                        </div>
                    </div>
                    
                    <div class="row g-4">
                        ${cardsHTML}
                    </div>
                </div>
            </section>
        `;
    }

    generateCardHTML(card, columnClass) {
        const { title, description, icon, iconColor, link, features = [] } = card;
        
        const featuresHTML = features.map(feature => {
            const featureIconColor = feature.iconColor || 'rgba(139, 0, 0, 1)';
            return `
                <li onclick="event.stopPropagation(); window.location.href='${feature.link}'">
                    <i class="${feature.icon}" style="color: ${featureIconColor};"></i>${feature.label}
                </li>
            `;
        }).join('');

        const featuresList = features.length > 0 ? `<ul class="feature-list">${featuresHTML}</ul>` : '';

        return `
            <div class="${columnClass}">
                <div class="functionality-card" onclick="window.location.href='${link}'">
                    <div class="card-body position-relative">
                        <div class="card-icon text-${iconColor}">
                            <i class="${icon}"></i>
                        </div>
                        <h5 class="card-title">${title}</h5>
                        <p class="card-text">${description}</p>
                        ${featuresList}
                    </div>
                </div>
            </div>
        `;
    }

    getColumnClasses(cardCount) {
        // Define column classes based on number of cards for optimal layout
        switch (cardCount) {
            case 1:
                return ['col-md-12 col-lg-8 mx-auto']; // Centered single card
            case 2:
                return ['col-md-6 col-lg-6', 'col-md-6 col-lg-6']; // Two equal cards
            case 3:
                return ['col-md-6 col-lg-4', 'col-md-6 col-lg-4', 'col-md-6 col-lg-4']; // Three equal cards
            case 4:
                return ['col-md-6 col-lg-3', 'col-md-6 col-lg-3', 'col-md-6 col-lg-3', 'col-md-6 col-lg-3']; // Four equal cards
            default:
                // For more than 4 cards, use a 4-column layout
                return Array(cardCount).fill('col-md-6 col-lg-3');
        }
    }

    // Method to update the menu with new data
    update(newOptions) {
        this.options = { ...this.options, ...newOptions };
        this.render();
    }

    // Method to add a new card
    addCard(card) {
        this.options.cards.push(card);
        this.render();
    }

    // Method to remove a card by index
    removeCard(index) {
        if (index >= 0 && index < this.options.cards.length) {
            this.options.cards.splice(index, 1);
            this.render();
        }
    }

    // Method to update a specific card
    updateCard(index, cardData) {
        if (index >= 0 && index < this.options.cards.length) {
            this.options.cards[index] = { ...this.options.cards[index], ...cardData };
            this.render();
        }
    }

    // Method to add a feature to a specific card
    addFeatureToCard(cardIndex, feature) {
        if (cardIndex >= 0 && cardIndex < this.options.cards.length) {
            if (!this.options.cards[cardIndex].features) {
                this.options.cards[cardIndex].features = [];
            }
            this.options.cards[cardIndex].features.push(feature);
            this.render();
        }
    }

    // Method to remove a feature from a specific card
    removeFeatureFromCard(cardIndex, featureIndex) {
        if (cardIndex >= 0 && cardIndex < this.options.cards.length) {
            const card = this.options.cards[cardIndex];
            if (card.features && featureIndex >= 0 && featureIndex < card.features.length) {
                card.features.splice(featureIndex, 1);
                this.render();
            }
        }
    }

    // Method to calculate and apply consistent heights for all cards
    applyConsistentHeights() {
        const container = document.getElementById(this.containerId);
        if (!container) return;

        const cards = container.querySelectorAll('.functionality-card');
        if (cards.length === 0) return;

        let maxTitleHeight = 0;
        let maxDescriptionHeight = 0;

        // First pass: calculate maximum heights
        cards.forEach(card => {
            const title = card.querySelector('.card-title');
            const description = card.querySelector('.card-text');
            
            if (title) {
                const titleHeight = title.offsetHeight;
                maxTitleHeight = Math.max(maxTitleHeight, titleHeight);
            }
            
            if (description) {
                const descriptionHeight = description.offsetHeight;
                maxDescriptionHeight = Math.max(maxDescriptionHeight, descriptionHeight);
            }
        });

        // Second pass: apply the maximum heights to all cards
        cards.forEach(card => {
            const title = card.querySelector('.card-title');
            const description = card.querySelector('.card-text');
            
            if (title && maxTitleHeight > 0) {
                title.style.minHeight = `${maxTitleHeight}px`;
            }
            
            if (description && maxDescriptionHeight > 0) {
                description.style.minHeight = `${maxDescriptionHeight}px`;
            }
        });
    }
}
