// Helper to create URL-friendly slugs matching CardTrader's URL structure
function slugify(text) {
    if (!text) return '';
    return text.toString().toLowerCase()
        .replace(/'/g, '-') // Replace apostrophe with hyphen
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s-]/g, '') // Remove other special characters
        .trim()
        .replace(/[\s_]+/g, '-') // Replace spaces with a single hyphen
        .replace(/-+/g, '-'); // Collapse multiple hyphens
}

// App State
const state = {
    apiToken: '',
    gameId: 5, // Default to Pokemon
    expansions: [],
    blueprints: [],
    listings: [],
    selectedExpansion: null,
    selectedBlueprint: null,
    
    // UI states
    searchMode: 'global', // 'global' or 'by-set'
    activeExpansionIndex: -1,
    activeBlueprintIndex: -1,
    activeGlobalCardIndex: -1,
    
    // Calculator state
    calcSelectedExpansion: null,
    calcBlueprints: [],
    activeCalcExpansionIndex: -1,
    calcResults: [],
    calcGlobalSelectAll: true,
    calcSort: 'code_asc',
    
    // Wishlist & Pagination state
    wishlist: JSON.parse(localStorage.getItem('pokeprice_wishlist')) || [],
    currentPage: 1,
    itemsPerPage: 50,
    filteredListingsCache: []
};

// DOM Elements (Resolved lazily to prevent race conditions on page load)
const elements = {
    get settingsSection() { return document.getElementById('settings-section'); },
    get settingsBody() { return document.getElementById('settings-body'); },
    get toggleSettings() { return document.getElementById('toggle-settings'); },
    get apiTokenInput() { return document.getElementById('api-token-input'); },
    get saveTokenBtn() { return document.getElementById('save-token-btn'); },
    get tokenStatusMsg() { return document.getElementById('token-status-msg'); },
    
    get tabGlobal() { return document.getElementById('tab-global'); },
    get tabBySet() { return document.getElementById('tab-by-set'); },
    get globalSearchContainer() { return document.getElementById('global-search-container'); },
    get globalCardSearch() { return document.getElementById('global-card-search'); },
    get clearGlobalCard() { return document.getElementById('clear-global-card'); },
    get globalCardDropdown() { return document.getElementById('global-card-dropdown'); },
    get globalCardLoading() { return document.getElementById('global-card-loading'); },
    get indexingStatusMsg() { return document.getElementById('indexing-status-msg'); },
    
    get expansionSearchContainer() { return document.getElementById('expansion-search-container'); },
    get expansionSearch() { return document.getElementById('expansion-search'); },
    get clearExpansion() { return document.getElementById('clear-expansion'); },
    get expansionDropdown() { return document.getElementById('expansion-dropdown'); },
    get expansionLoading() { return document.getElementById('expansion-loading'); },
    
    get cardSearchContainer() { return document.getElementById('card-search-container'); },
    get cardSearch() { return document.getElementById('card-search'); },
    get clearCard() { return document.getElementById('clear-card'); },
    get cardDropdown() { return document.getElementById('card-dropdown'); },
    get cardLoading() { return document.getElementById('card-loading'); },
    get cardHelperText() { return document.getElementById('card-helper-text'); },
    
    get resultsSection() { return document.getElementById('results-section'); },
    get emptyState() { return document.getElementById('empty-state'); },
    
    get cardImage() { return document.getElementById('card-image'); },
    get imagePlaceholder() { return document.getElementById('image-placeholder'); },
    get resultCardName() { return document.getElementById('result-card-name'); },
    get resultCardExpansion() { return document.getElementById('result-card-expansion'); },
    get resultCardCode() { return document.getElementById('result-card-code'); },
    get resultCardCategory() { return document.getElementById('result-card-category'); },
    
    get statMinPrice() { return document.getElementById('stat-min-price'); },
    get statAvgPrice() { return document.getElementById('stat-avg-price'); },
    get statListingsCount() { return document.getElementById('stat-listings-count'); },
    
    get filterLang() { return document.getElementById('filter-lang'); },
    get filterFoil() { return document.getElementById('filter-foil'); },
    get filterCond() { return document.getElementById('filter-cond'); },
    get sortBy() { return document.getElementById('sort-by'); },
    get listingsBodyTable() { return document.getElementById('listings-body-table'); },
    get noListingsMsg() { return document.getElementById('no-listings-msg'); },
    get listingsLoading() { return document.getElementById('listings-loading'); },
    
    get expansionBrowserSection() { return document.getElementById('expansion-browser-section'); },
    get toggleExpansionBrowser() { return document.getElementById('toggle-expansion-browser'); },
    get expansionBrowserCount() { return document.getElementById('expansion-browser-count'); },
    get expansionBrowserTitleText() { return document.getElementById('expansion-browser-title-text'); },
    get expansionCardsGrid() { return document.getElementById('expansion-cards-grid'); },
    
    // Calculator elements
    get tabCalculator() { return document.getElementById('tab-calculator'); },
    get calculatorSection() { return document.getElementById('calculator-section'); },
    get calcExpansionSearch() { return document.getElementById('calc-expansion-search'); },
    get clearCalcExpansion() { return document.getElementById('clear-calc-expansion'); },
    get calcExpansionDropdown() { return document.getElementById('calc-expansion-dropdown'); },
    get calcFilterLang() { return document.getElementById('calc-filter-lang'); },
    get calcFilterFirstEdition() { return document.getElementById('calc-filter-first-edition'); },
    get calcFilterCond() { return document.getElementById('calc-filter-cond'); },
    get calcSort() { return document.getElementById('calc-sort'); },
    get calculateBtn() { return document.getElementById('calculate-btn'); },
    get calcLoading() { return document.getElementById('calc-loading'); },
    get calcResultsSummary() { return document.getElementById('calc-results-summary'); },
    get calcTotalCost() { return document.getElementById('calc-total-cost'); },
    get calcCardsFound() { return document.getElementById('calc-cards-found'); },
    get calcAvgCardPrice() { return document.getElementById('calc-avg-card-price'); },
    get calcCardsTbody() { return document.getElementById('calc-cards-tbody'); },
    get calcSelectAll() { return document.getElementById('calc-select-all'); },

    // New Wishlist elements
    get tabWishlist() { return document.getElementById('tab-wishlist'); },
    get wishlistSection() { return document.getElementById('wishlist-section'); },
    get wishlistCount() { return document.getElementById('wishlist-count'); },
    get wishlistGameTabs() { return document.getElementById('wishlist-game-tabs'); },
    get wishlistGrid() { return document.getElementById('wishlist-grid'); },
    get wishlistEmpty() { return document.getElementById('wishlist-empty'); },
    get wishlistBtn() { return document.getElementById('wishlist-btn'); },

    // New Pagination elements
    get itemsPerPage() { return document.getElementById('items-per-page'); },
    get paginationControls() { return document.getElementById('pagination-controls'); },
    get pagePrev() { return document.getElementById('page-prev'); },
    get pageNext() { return document.getElementById('page-next'); },
    get pageInfo() { return document.getElementById('page-info'); }
};

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    // 1. Toggle settings collapse
    elements.toggleSettings.addEventListener('click', () => {
        const body = document.getElementById('settings-body');
        if (body.style.display === 'none') {
            body.style.display = 'block';
        } else {
            body.style.display = 'none';
        }
    });

    // 1b. Toggle expansion browser collapse
    elements.toggleExpansionBrowser.addEventListener('click', () => {
        elements.expansionBrowserSection.classList.toggle('collapsed');
    });

    // 1c. Game Selector
    document.querySelectorAll('.game-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Update active state
            document.querySelectorAll('.game-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            
            // Update state
            state.gameId = parseInt(e.target.dataset.gameId, 10);
            
            // Clear UI
            elements.globalCardSearch.value = '';
            elements.cardSearch.value = '';
            elements.resultsSection.style.display = 'none';
            if (elements.emptyState) elements.emptyState.style.display = 'block';
            elements.globalCardDropdown.classList.remove('active');
            elements.cardDropdown.classList.remove('active');
            state.selectedBlueprint = null;
            state.activeBlueprintIndex = -1;
            state.activeGlobalCardIndex = -1;
            
            // Reload expansions
            if (state.apiToken) {
                elements.expansionLoading.style.display = 'flex';
                fetchExpansions();
            }
        });
    });

    // 2. Load API Token
    const savedToken = localStorage.getItem('cardtrader_token');
    if (savedToken) {
        state.apiToken = savedToken;
        elements.apiTokenInput.value = savedToken;
        updateTokenStatus('green', 'Token caricato da localStorage.');
        initializeGames();
    } else {
        // Test if server has env token
        testServerToken();
    }

    // 3. Save API Token Action
    elements.saveTokenBtn.addEventListener('click', () => {
        const token = elements.apiTokenInput.value.trim();
        if (token) {
            localStorage.setItem('cardtrader_token', token);
            state.apiToken = token;
            updateTokenStatus('green', 'Token salvato con successo!');
            // Collapse settings after saving
            setTimeout(() => {
                document.getElementById('settings-body').style.display = 'none';
            }, 600);
            initializeGames();
        } else {
            localStorage.removeItem('cardtrader_token');
            state.apiToken = '';
            updateTokenStatus('red', 'Inserisci un token valido.');
            disableInputs();
        }
    });

    // 4. Setup autocomplete listeners
    setupAutocomplete();
    
    // 5. Setup filters & sort listeners
    elements.filterLang.addEventListener('change', renderListings);
    elements.filterFoil.addEventListener('change', renderListings);
    elements.filterCond.addEventListener('change', renderListings);
    elements.sortBy.addEventListener('change', renderListings);
    
    // 6. Setup Search Mode Tabs
    elements.tabGlobal.addEventListener('click', () => switchSearchMode('global'));
    elements.tabBySet.addEventListener('click', () => switchSearchMode('by-set'));
    elements.tabCalculator.addEventListener('click', () => switchSearchMode('calculator'));
    elements.tabWishlist.addEventListener('click', () => switchSearchMode('wishlist'));

    // Pagination Listeners
    elements.itemsPerPage.addEventListener('change', (e) => {
        const val = e.target.value;
        state.itemsPerPage = val === 'all' ? Number.MAX_SAFE_INTEGER : parseInt(val);
        state.currentPage = 1;
        renderPaginatedListings();
    });
    
    elements.pagePrev.addEventListener('click', () => {
        if (state.currentPage > 1) {
            state.currentPage--;
            renderPaginatedListings();
        }
    });
    
    elements.pageNext.addEventListener('click', () => {
        const maxPage = Math.ceil(state.filteredListingsCache.length / state.itemsPerPage);
        if (state.currentPage < maxPage) {
            state.currentPage++;
            renderPaginatedListings();
        }
    });

    // Wishlist Listeners
    elements.wishlistBtn.addEventListener('click', () => {
        if (state.selectedBlueprint) {
            toggleFavorite(state.selectedBlueprint);
        }
    });

    // Init wishlist render if we need
    // renderWishlist() is called when tab is clicked.
    
    // Setup Calculator button listener
    elements.calculateBtn.addEventListener('click', runCompletionCalculation);
    
    // Setup Sort Listener
    elements.calcSort.addEventListener('change', (e) => {
        state.calcSort = e.target.value;
        if (state.calcResults && state.calcResults.length > 0) {
            sortCalcResults();
            renderCalcTable();
        }
    });
    
    // 7. Start polling background indexing status
    startIndexingStatusPolling();
});

// Helper for HTTP requests that automatically includes the token in proxy calls
async function fetchAPI(endpoint) {
    const headers = {};
    if (state.apiToken) {
        headers['X-CardTrader-Token'] = state.apiToken;
    }
    
    const response = await fetch(endpoint, { headers });
    let data;
    try {
        data = await response.json();
    } catch (e) {
        throw new Error(`Risposta del server non valida (non-JSON). HTTP Status: ${response.status}`);
    }
    
    if (!response.ok) {
        throw new Error(data.error || `Errore HTTP! Status: ${response.status}`);
    }
    return data;
}

// Check if server is running with env token
async function testServerToken() {
    try {
        updateTokenStatus('yellow', 'Verifica configurazione server...');
        let games = await fetchAPI('/api/games');
        games = games.array ? games.array : games; // Fix for CardTrader API array format
        
        if (games && games.length > 0) {
            updateTokenStatus('green', 'Token API fornito dal server (.env).');
            // Auto-collapse settings
            document.getElementById('settings-body').style.display = 'none';
            processGamesList(games);
        }
    } catch (e) {
        updateTokenStatus('yellow', 'Token mancante. Inserisci il tuo token per iniziare.');
    }
}

// Token Status bar utility
function updateTokenStatus(color, text) {
    elements.tokenStatusMsg.innerHTML = `<span class="status-indicator ${color}"></span> ${text}`;
    
    const headerIndicator = document.getElementById('header-token-indicator');
    if (headerIndicator) {
        headerIndicator.className = `status-indicator ${color}`;
    }
}

// Lock search inputs when not authenticated
function disableInputs() {
    elements.expansionSearch.disabled = true;
    elements.cardSearch.disabled = true;
    elements.cardSearchContainer.classList.add('disabled');
    elements.globalCardSearch.disabled = true;
    elements.globalSearchContainer.classList.add('disabled');
    elements.calcExpansionSearch.disabled = true;
}

// // Run initial steps after authentication
async function initializeGames() {
    try {
        elements.expansionLoading.style.display = 'flex';
        await fetchExpansions();
    } catch (e) {
        console.error(e);
        updateTokenStatus('red', `Errore inizializzazione: ${e.message}`);
        disableInputs();
        elements.expansionLoading.style.display = 'none';
    }
}

// Fetch all expansions and filter by active game
async function fetchExpansions() {
    try {
        const expansions = await fetchAPI('/api/expansions');
        
        // Extract array if wrapped in an object
        const expansionsArray = Array.isArray(expansions) ? expansions : (expansions && Array.isArray(expansions.array) ? expansions.array : null);
        
        if (!expansionsArray) {
            throw new Error("La risposta delle espansioni non contiene un elenco valido.");
        }
        
        // Filter expansions for selected game
        state.expansions = expansionsArray.filter(exp => exp.game_id === state.gameId);
        
        // Sort expansions alphabetically by name
        state.expansions.sort((a, b) => a.name.localeCompare(b.name));
        
        elements.expansionSearch.disabled = false;
        elements.globalCardSearch.disabled = false;
        elements.globalSearchContainer.classList.remove('disabled');
        elements.calcExpansionSearch.disabled = false;
        elements.expansionLoading.style.display = 'none';
        console.log(`Loaded ${state.expansions.length} expansions for game ${state.gameId}.`);
    } catch (e) {
        console.error(e);
        updateTokenStatus('red', `Errore caricamento espansioni: ${e.message}`);
        disableInputs();
        elements.expansionLoading.style.display = 'none';
    }
}

// Autocomplete Inputs Functionality
function setupAutocomplete() {
    // EXPANSIONS INPUT EVENTS
    elements.expansionSearch.addEventListener('input', () => {
        const query = elements.expansionSearch.value.trim().toLowerCase();
        state.activeExpansionIndex = -1;
        
        if (!query) {
            elements.clearExpansion.style.display = 'none';
            elements.expansionDropdown.classList.remove('active');
            return;
        }
        
        elements.clearExpansion.style.display = 'block';
        
        // Filter matching expansions
        const matches = state.expansions.filter(exp => 
            exp.name.toLowerCase().includes(query) || 
            (exp.code && exp.code.toLowerCase().includes(query))
        ).slice(0, 15); // limit to top 15
        
        renderExpansionDropdown(matches);
    });

    elements.clearExpansion.addEventListener('click', () => {
        elements.expansionSearch.value = '';
        elements.clearExpansion.style.display = 'none';
        elements.expansionDropdown.classList.remove('active');
        state.selectedExpansion = null;
        
        // Reset card search too
        resetCardSearch();
        elements.resultsSection.style.display = 'none';
        if (elements.emptyState) elements.emptyState.style.display = 'block';
    });

    // CARD INPUT EVENTS
    elements.cardSearch.addEventListener('input', () => {
        const query = elements.cardSearch.value.trim().toLowerCase();
        state.activeBlueprintIndex = -1;
        
        if (!query) {
            elements.clearCard.style.display = 'none';
            elements.cardDropdown.classList.remove('active');
            return;
        }
        
        elements.clearCard.style.display = 'block';
        
        // Split query into words to support searching like "charizard 004"
        const queryWords = query.split(/\s+/).filter(w => w.length > 0);
        
        // Filter matching blueprints locally
        const matches = state.blueprints.filter(bp => {
            let searchTarget = (bp.name + " " + (bp.version || "")).toLowerCase();
            if (bp.fixed_properties && bp.fixed_properties.collector_number) {
                searchTarget += " " + bp.fixed_properties.collector_number.toLowerCase();
            }
            return queryWords.every(word => searchTarget.includes(word));
        }).slice(0, 20); // limit to top 20
        
        renderCardDropdown(matches);
    });

    elements.clearCard.addEventListener('click', () => {
        elements.cardSearch.value = '';
        elements.clearCard.style.display = 'none';
        elements.cardDropdown.classList.remove('active');
        state.selectedBlueprint = null;
        elements.resultsSection.style.display = 'none';
        if (elements.emptyState) elements.emptyState.style.display = 'block';
    });

    // GLOBAL CARD INPUT EVENTS
    let globalSearchTimeout = null;
    elements.globalCardSearch.addEventListener('input', () => {
        const query = elements.globalCardSearch.value.trim();
        state.activeGlobalCardIndex = -1;
        
        if (globalSearchTimeout) clearTimeout(globalSearchTimeout);
        
        if (query.length < 2) {
            elements.clearGlobalCard.style.display = 'none';
            elements.globalCardDropdown.classList.remove('active');
            return;
        }
        
        elements.clearGlobalCard.style.display = 'block';
        
        // Debounce search requests to not overload the local server on typing
        globalSearchTimeout = setTimeout(async () => {
            elements.globalCardLoading.style.display = 'flex';
            try {
                const results = await fetchAPI(`/api/search?q=${encodeURIComponent(query)}&game_id=${state.gameId}`);
                renderGlobalCardDropdown(results);
                
                if (elements.expansionBrowserTitleText) {
                    elements.expansionBrowserTitleText.textContent = "🔍 Risultati Ricerca";
                }
                elements.expansionBrowserCount.textContent = results.length;
                renderExpansionCardsGrid(results);
                elements.expansionBrowserSection.style.display = 'block';
            } catch (e) {
                console.error(e);
            } finally {
                elements.globalCardLoading.style.display = 'none';
            }
        }, 300);
    });

    elements.clearGlobalCard.addEventListener('click', () => {
        elements.globalCardSearch.value = '';
        elements.clearGlobalCard.style.display = 'none';
        elements.globalCardDropdown.classList.remove('active');
        state.selectedBlueprint = null;
        elements.resultsSection.style.display = 'none';
        if (elements.expansionBrowserSection) elements.expansionBrowserSection.style.display = 'none';
        if (elements.emptyState) elements.emptyState.style.display = 'block';
    });

    // CALCULATOR EXPANSIONS INPUT EVENTS
    elements.calcExpansionSearch.addEventListener('input', () => {
        const query = elements.calcExpansionSearch.value.trim().toLowerCase();
        state.activeCalcExpansionIndex = -1;
        
        if (!query) {
            elements.clearCalcExpansion.style.display = 'none';
            elements.calcExpansionDropdown.classList.remove('active');
            return;
        }
        
        elements.clearCalcExpansion.style.display = 'block';
        
        // Filter matching expansions
        const matches = state.expansions.filter(exp => 
            exp.name.toLowerCase().includes(query) || 
            (exp.code && exp.code.toLowerCase().includes(query))
        ).slice(0, 15);
        
        renderCalcExpansionDropdown(matches);
    });

    elements.clearCalcExpansion.addEventListener('click', () => {
        elements.calcExpansionSearch.value = '';
        elements.clearCalcExpansion.style.display = 'none';
        elements.calcExpansionDropdown.classList.remove('active');
        state.calcSelectedExpansion = null;
        state.calcBlueprints = [];
        elements.calculateBtn.disabled = true;
        elements.calcResultsSummary.style.display = 'none';
    });

    // Close dropdowns on click outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.autocomplete-container')) {
            elements.expansionDropdown.classList.remove('active');
            elements.cardDropdown.classList.remove('active');
            elements.globalCardDropdown.classList.remove('active');
            elements.calcExpansionDropdown.classList.remove('active');
        }
    });
}

// Render Expansion Dropdown list
function renderExpansionDropdown(matches) {
    if (matches.length === 0) {
        elements.expansionDropdown.innerHTML = '<div class="dropdown-item">Nessuna espansione trovata</div>';
        elements.expansionDropdown.classList.add('active');
        return;
    }
    
    elements.expansionDropdown.innerHTML = matches.map(exp => `
        <div class="dropdown-item" data-id="${exp.id}" data-name="${exp.name}">
            <span>${exp.name}</span>
            ${exp.code ? `<span class="set-code">${exp.code}</span>` : ''}
        </div>
    `).join('');
    
    elements.expansionDropdown.classList.add('active');
    
    // Handle click on items
    elements.expansionDropdown.querySelectorAll('.dropdown-item').forEach(item => {
        item.addEventListener('click', () => {
            const expId = parseInt(item.dataset.id);
            const expName = item.dataset.name;
            
            elements.expansionSearch.value = expName;
            elements.expansionDropdown.classList.remove('active');
            
            const selected = state.expansions.find(e => e.id === expId);
            selectExpansion(selected);
        });
    });
}

// Action when an expansion is selected
async function selectExpansion(expansion) {
    state.selectedExpansion = expansion;
    resetCardSearch();
    
    elements.cardLoading.style.display = 'flex';
    elements.cardHelperText.style.display = 'none';
    
    // Skeleton loaders in expansion browser
    let skeletonHtml = '';
    for (let i = 0; i < 12; i++) {
        skeletonHtml += `
            <div class="glass-card" style="padding: 1rem; display: flex; flex-direction: column; gap: 10px;">
                <div class="skeleton" style="height: 180px; border-radius: 8px; width: 100%;"></div>
                <div class="skeleton skeleton-text"></div>
                <div class="skeleton skeleton-text short"></div>
            </div>
        `;
    }
    elements.expansionCardsGrid.innerHTML = skeletonHtml;
    elements.expansionBrowserSection.style.display = 'block';
    
    try {
        console.log(`Fetching blueprints for expansion: ${expansion.name} (ID: ${expansion.id})`);
        const blueprints = await fetchAPI(`/api/blueprints?expansion_id=${expansion.id}`);
        
        // Extract array if wrapped in an object
        const blueprintsArray = Array.isArray(blueprints) ? blueprints : (blueprints && Array.isArray(blueprints.array) ? blueprints.array : null);
        
        if (!blueprintsArray) {
            throw new Error("La risposta delle carte non contiene un elenco valido.");
        }
        
        state.blueprints = blueprintsArray;
        
        // Ordina le carte per codice/numero anziché in ordine alfabetico
        sortBlueprintsByCode(state.blueprints);
        
        elements.cardSearch.disabled = false;
        elements.cardSearchContainer.classList.remove('disabled');
        elements.cardSearch.placeholder = "Cerca la carta (es. Charizard)...";
        
        // Popola la sezione di navigazione visuale delle carte
        if (elements.expansionBrowserTitleText) {
            elements.expansionBrowserTitleText.textContent = "🃏 Carte in questa Espansione";
        }
        elements.expansionBrowserCount.textContent = state.blueprints.length;
        renderExpansionCardsGrid(state.blueprints);
        elements.expansionBrowserSection.style.display = 'block';
        elements.expansionBrowserSection.classList.remove('collapsed');
        
        console.log(`Loaded ${state.blueprints.length} blueprints for expansion.`);
    } catch (e) {
        console.error(e);
        elements.cardHelperText.textContent = `Errore caricamento carte: ${e.message}`;
        elements.cardHelperText.style.display = 'block';
    } finally {
        elements.cardLoading.style.display = 'none';
    }
}

// Reset Card Search input and lock it
function resetCardSearch() {
    elements.cardSearch.value = '';
    elements.cardSearch.disabled = true;
    elements.cardSearchContainer.classList.add('disabled');
    elements.clearCard.style.display = 'none';
    elements.cardDropdown.classList.remove('active');
    elements.cardHelperText.textContent = "Seleziona prima un'espansione per cercare le carte.";
    elements.cardHelperText.style.display = 'block';
    state.blueprints = [];
    state.selectedBlueprint = null;
    
    // Reset della navigazione delle carte
    if (elements.expansionCardsGrid) {
        elements.expansionCardsGrid.innerHTML = '';
    }
    if (elements.expansionBrowserSection) {
        elements.expansionBrowserSection.style.display = 'none';
    }
}

// Render Card/Blueprint Dropdown list
function renderCardDropdown(matches) {
    if (matches.length === 0) {
        elements.cardDropdown.innerHTML = '<div class="dropdown-item">Nessuna carta trovata</div>';
        elements.cardDropdown.classList.add('active');
        return;
    }
    
    elements.cardDropdown.innerHTML = matches.map(bp => `
        <div class="dropdown-item" data-id="${bp.id}" data-name="${bp.name}">
            <span>${bp.name}</span>
            ${bp.version ? `<span class="set-code">${bp.version}</span>` : ''}
        </div>
    `).join('');
    
    elements.cardDropdown.classList.add('active');
    
    // Handle click on items
    elements.cardDropdown.querySelectorAll('.dropdown-item').forEach(item => {
        item.addEventListener('click', () => {
            const bpId = parseInt(item.dataset.id);
            const bpName = item.dataset.name;
            
            elements.cardSearch.value = bpName;
            elements.cardDropdown.classList.remove('active');
            
            const selected = state.blueprints.find(b => b.id === bpId);
            selectBlueprint(selected);
        });
    });
}

// Action when a card is selected (fetches listings and renders prices)
async function selectBlueprint(blueprint) {
    state.selectedBlueprint = blueprint;
    
    // Sync con l'input di ricerca per set se siamo in quella modalità
    if (state.searchMode === 'by-set') {
        elements.cardSearch.value = blueprint.name;
        elements.clearCard.style.display = 'block';
    }
    
    // Evidenzia la carta selezionata nella griglia
    if (elements.expansionCardsGrid) {
        const gridItems = elements.expansionCardsGrid.querySelectorAll('.expansion-card-item');
        gridItems.forEach(item => {
            if (parseInt(item.dataset.id) === blueprint.id) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        });
    }
    
    // Auto-collapse la griglia delle carte per dare spazio ai risultati
    if (elements.expansionBrowserSection && !elements.expansionBrowserSection.classList.contains('collapsed')) {
        elements.expansionBrowserSection.classList.add('collapsed');
    }
    
    // Show results skeleton and hide empty state
    if (elements.emptyState) elements.emptyState.style.display = 'none';
    elements.resultsSection.style.display = 'grid';
    elements.listingsLoading.style.display = 'flex';
    
    // Populate card static details
    elements.resultCardName.textContent = blueprint.name;
    elements.resultCardExpansion.textContent = state.selectedExpansion.name;
    elements.resultCardCode.textContent = state.selectedExpansion.code || '';
    
    // Card Image
    if (blueprint.image_url) {
        elements.cardImage.src = blueprint.image_url;
        elements.cardImage.style.display = 'block';
        elements.imagePlaceholder.style.display = 'none';
    } else {
        elements.cardImage.src = '';
        elements.cardImage.style.display = 'none';
        elements.imagePlaceholder.style.display = 'flex';
    }
    
    // CardTrader Link
    const linkEl = document.getElementById('result-card-link');
    if (linkEl) {
        linkEl.href = getCardTraderLink(blueprint.id, blueprint.slug);
    }

    updateWishlistButton(blueprint.id);

    try {
        console.log(`Fetching products for blueprint ID: ${blueprint.id}`);
        const products = await fetchAPI(`/api/products?blueprint_id=${blueprint.id}`);
        
        let productsArray = null;
        if (Array.isArray(products)) {
            productsArray = products;
        } else if (products && typeof products === 'object') {
            if (Array.isArray(products[blueprint.id])) {
                productsArray = products[blueprint.id];
            } else if (Array.isArray(products.array)) {
                productsArray = products.array;
            } else {
                // Find the first value that is an array
                const arrayVal = Object.values(products).find(val => Array.isArray(val));
                if (arrayVal) {
                    productsArray = arrayVal;
                }
            }
        }
        
        if (!productsArray) {
            throw new Error("La risposta delle inserzioni non contiene un elenco valido.");
        }
        
        state.listings = productsArray;
        console.log("Listings loaded for blueprint:", blueprint.id, productsArray);
        
        // Fetch Category name from category_id
        elements.resultCardCategory.textContent = blueprint.category_id ? `Card Category (${blueprint.category_id})` : 'Pokémon Single Card';
        
        // Render marketplace listings (which also updates price statistics with filtered results)
        renderListings();
        
        // Scorri dolcemente verso i risultati
        setTimeout(() => {
            elements.resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 50);
        
    } catch (e) {
        console.error('Error fetching pricing:', e);
        showToast(`Errore caricamento prezzi: ${e.message}`, 'error');
    } finally {
        elements.listingsLoading.style.display = 'none';
    }
}

// Extract custom fields from properties_hash safely
function getProperty(props, pattern) {
    if (!props) return null;
    const key = Object.keys(props).find(k => k.toLowerCase().includes(pattern.toLowerCase()));
    return key ? props[key] : null;
}

// Calculate and show Min, Average, Listings Count based on a list of listings
function updatePriceStatistics(listings = state.listings) {
    if (!listings || listings.length === 0) {
        elements.statMinPrice.textContent = 'N/A';
        elements.statAvgPrice.textContent = 'N/A';
        elements.statListingsCount.textContent = '0';
        return;
    }
    
    // Standard CardTrader products might contain cents
    const prices = listings
        .filter(l => l.price && typeof l.price.cents !== 'undefined' && l.price.cents !== null)
        .map(l => l.price.cents / 100);
        
    if (prices.length === 0) {
        elements.statMinPrice.textContent = 'N/D';
        elements.statAvgPrice.textContent = 'N/D';
        elements.statListingsCount.textContent = '0';
        return;
    }
    
    const min = Math.min(...prices);
    const sum = prices.reduce((acc, p) => acc + p, 0);
    const avg = sum / prices.length;
    
    const firstWithCurrency = listings.find(l => l.price && l.price.currency);
    const currency = (firstWithCurrency && firstWithCurrency.price.currency === 'USD') ? '$' : '€';
    
    elements.statMinPrice.textContent = `${currency} ${min.toFixed(2)}`;
    elements.statAvgPrice.textContent = `${currency} ${avg.toFixed(2)}`;
    elements.statListingsCount.textContent = listings.length;
}

// Render the Listings Table based on sorting and filtering state
function renderListings() {
    const langFilter = elements.filterLang.value;
    const foilFilter = elements.filterFoil.value;
    const condFilter = elements.filterCond.value;
    const sortVal = elements.sortBy.value;
    
    if (!state.listings) {
        elements.listingsBodyTable.innerHTML = '';
        elements.noListingsMsg.style.display = 'block';
        return;
    }
    
    // 1. Filter
    let filtered = state.listings.filter(listing => {
        if (!listing) return false;
        const props = listing.properties_hash;
        
        // Language filter
        const langValue = getProperty(props, 'language');
        if (langFilter !== 'all') {
            if (!langValue || langValue.toLowerCase() !== langFilter) {
                return false;
            }
        }
        
        // Foil filter
        const isFoil = getProperty(props, 'foil') === true || getProperty(props, 'foil') === 'true';
        if (foilFilter === 'foil' && !isFoil) return false;
        if (foilFilter === 'normal' && isFoil) return false;
        
        // Condition filter (Minimum condition logic)
        const condValue = getProperty(props, 'condition');
        if (condFilter !== 'all') {
            const order = { 'near mint': 5, 'slightly played': 4, 'moderately played': 3, 'played': 2, 'heavily played': 1, 'poor': 0 };
            const listingScore = condValue ? (order[condValue.toLowerCase()] ?? 0) : 0;
            const filterScore = order[condFilter.toLowerCase()] ?? 0;
            if (listingScore < filterScore) {
                return false;
            }
        }
        
        return true;
    });
    
    // Update price statistics dynamically based on current filtered listings
    updatePriceStatistics(filtered);
    
    // 2. Sort
    filtered.sort((a, b) => {
        const priceA = (a && a.price && typeof a.price.cents !== 'undefined') ? a.price.cents : 0;
        const priceB = (b && b.price && typeof b.price.cents !== 'undefined') ? b.price.cents : 0;
        
        if (sortVal === 'price-asc') {
            return priceA - priceB;
        } else if (sortVal === 'price-desc') {
            return priceB - priceA;
        } else if (sortVal === 'cond-best') {
            const order = { 'near mint': 5, 'slightly played': 4, 'moderately played': 3, 'played': 2, 'heavily played': 1, 'poor': 0 };
            const condA = (a && a.properties_hash) ? (getProperty(a.properties_hash, 'condition') || '') : '';
            const condB = (b && b.properties_hash) ? (getProperty(b.properties_hash, 'condition') || '') : '';
            const scoreA = order[condA.toLowerCase()] || 0;
            const scoreB = order[condB.toLowerCase()] || 0;
            return scoreB - scoreA; // Best condition first
        }
        return 0;
    });
    
    // 3. Render Paginated
    state.filteredListingsCache = filtered;
    state.currentPage = 1;
    renderPaginatedListings();
}

function renderPaginatedListings() {
    const filtered = state.filteredListingsCache;
    
    if (!filtered || filtered.length === 0) {
        elements.listingsBodyTable.innerHTML = '';
        elements.noListingsMsg.style.display = 'block';
        elements.paginationControls.style.display = 'none';
        return;
    }
    
    elements.noListingsMsg.style.display = 'none';
    
    const maxPage = Math.ceil(filtered.length / state.itemsPerPage);
    if (state.currentPage > maxPage) state.currentPage = maxPage;
    if (state.currentPage < 1) state.currentPage = 1;
    
    const startIndex = (state.currentPage - 1) * state.itemsPerPage;
    const endIndex = Math.min(startIndex + state.itemsPerPage, filtered.length);
    const paginatedItems = filtered.slice(startIndex, endIndex);
    
    if (maxPage > 1) {
        elements.paginationControls.style.display = 'flex';
        elements.pageInfo.textContent = `Pagina ${state.currentPage} di ${maxPage}`;
        elements.pagePrev.disabled = state.currentPage === 1;
        elements.pageNext.disabled = state.currentPage === maxPage;
    } else {
        elements.paginationControls.style.display = 'none';
    }
    
    elements.listingsBodyTable.innerHTML = paginatedItems.map(listing => {
        const props = listing.properties_hash;
        const cond = getProperty(props, 'condition') || 'N/D';
        const lang = getProperty(props, 'language') || 'N/D';
        const isFoil = getProperty(props, 'foil') === true || getProperty(props, 'foil') === 'true';
        
        // Condition badge class mapping
        let condClass = 'poor';
        const condLower = cond.toLowerCase();
        if (condLower.includes('near mint') || condLower.includes('mint')) condClass = 'mint';
        else if (condLower.includes('slightly')) condClass = 'sp';
        else if (condLower.includes('moderately')) condClass = 'mp';
        else if (condLower.includes('played') || condLower.includes('heavily')) condClass = 'played';
        
        // Price format
        const priceVal = (listing.price && typeof listing.price.cents !== 'undefined') ? (listing.price.cents / 100).toFixed(2) : '0.00';
        const currencySym = (listing.price && listing.price.currency === 'USD') ? '$' : '€';
        
        // Seller details
        const sellerName = (listing.user && listing.user.username) ? listing.user.username : 'Privato';
        
        return `
            <tr>
                <td><span class="cond-badge ${condClass}">${cond}</span></td>
                <td><span class="lang-badge">${lang}</span></td>
                <td>${isFoil ? '<span class="foil-badge">Foil</span>' : '<span class="normal-badge">Normal</span>'}</td>
                <td><span class="price-text">${currencySym} ${priceVal}</span></td>
                <td>${listing.quantity || 1}</td>
                <td><div class="seller-text" title="${sellerName}">${sellerName}</div></td>
            </tr>
        `;
    }).join('');
}

// Switch between Global Search and Search By Set modes
function switchSearchMode(mode) {
    state.searchMode = mode;
    
    // Toggle active classes on tab buttons
    elements.tabGlobal.classList.remove('active');
    elements.tabBySet.classList.remove('active');
    elements.tabCalculator.classList.remove('active');
    elements.tabWishlist.classList.remove('active');
    
    const searchSection = document.querySelector('.search-section');
    
    if (mode === 'global') {
        elements.tabGlobal.classList.add('active');
        if (searchSection) searchSection.style.display = 'grid';
        elements.globalSearchContainer.style.display = 'block';
        elements.expansionSearchContainer.style.display = 'none';
        elements.cardSearchContainer.style.display = 'none';
        elements.calculatorSection.style.display = 'none';
        
        elements.resultsSection.style.display = 'none';
        if (elements.emptyState) elements.emptyState.style.display = 'block';
    } else if (mode === 'by-set') {
        elements.tabBySet.classList.add('active');
        if (searchSection) searchSection.style.display = 'grid';
        elements.globalSearchContainer.style.display = 'none';
        elements.expansionSearchContainer.style.display = 'block';
        elements.cardSearchContainer.style.display = 'block';
        elements.calculatorSection.style.display = 'none';
        
        elements.resultsSection.style.display = 'none';
        if (elements.emptyState) elements.emptyState.style.display = 'block';
    } else if (mode === 'calculator') {
        elements.tabCalculator.classList.add('active');
        if (searchSection) searchSection.style.display = 'none';
        elements.globalSearchContainer.style.display = 'none';
        elements.expansionSearchContainer.style.display = 'none';
        elements.cardSearchContainer.style.display = 'none';
        elements.calculatorSection.style.display = 'block';
        
        elements.resultsSection.style.display = 'none';
        if (elements.emptyState) elements.emptyState.style.display = 'none';
        elements.wishlistSection.style.display = 'none';
    } else if (mode === 'wishlist') {
        elements.tabWishlist.classList.add('active');
        if (searchSection) searchSection.style.display = 'none';
        elements.globalSearchContainer.style.display = 'none';
        elements.expansionSearchContainer.style.display = 'none';
        elements.cardSearchContainer.style.display = 'none';
        elements.calculatorSection.style.display = 'none';
        
        elements.resultsSection.style.display = 'none';
        if (elements.emptyState) elements.emptyState.style.display = 'none';
        
        renderWishlist();
        elements.wishlistSection.style.display = 'block';
    }
    
    // Nascondi la sezione di navigazione carte
    if (elements.expansionBrowserSection) {
        elements.expansionBrowserSection.style.display = 'none';
    }
    
    // Clear inputs
    elements.globalCardSearch.value = '';
    elements.clearGlobalCard.style.display = 'none';
    elements.globalCardDropdown.classList.remove('active');
    
    elements.expansionSearch.value = '';
    elements.clearExpansion.style.display = 'none';
    elements.expansionDropdown.classList.remove('active');
    
    elements.calcExpansionSearch.value = '';
    elements.clearCalcExpansion.style.display = 'none';
    elements.calcExpansionDropdown.classList.remove('active');
    elements.calculateBtn.disabled = true;
    elements.calcResultsSummary.style.display = 'none';
    elements.calcLoading.style.display = 'none';
    state.calcSelectedExpansion = null;
    state.calcBlueprints = [];
    
    resetCardSearch();
}

// Render Global Card Dropdown list
function renderGlobalCardDropdown(matches) {
    if (!matches || matches.length === 0) {
        elements.globalCardDropdown.innerHTML = '<div class="dropdown-item">Nessuna carta trovata nelle espansioni indicizzate</div>';
        elements.globalCardDropdown.classList.add('active');
        return;
    }
    
    elements.globalCardDropdown.innerHTML = matches.map(bp => `
        <div class="dropdown-item" data-id="${bp.id}" data-expansion-id="${bp.expansion_id}" data-expansion-name="${bp.expansion_name}" data-expansion-code="${bp.expansion_code}">
            <div class="card-title-row">
                <span class="card-name">${bp.name}</span>
                ${bp.version ? `<span class="card-version-sub">${bp.version}</span>` : ''}
            </div>
            <span class="set-code">${bp.expansion_name}</span>
        </div>
    `).join('');
    
    elements.globalCardDropdown.classList.add('active');
    
    // Handle click on items
    elements.globalCardDropdown.querySelectorAll('.dropdown-item').forEach(item => {
        item.addEventListener('click', () => {
            const bpId = parseInt(item.dataset.id);
            const expId = parseInt(item.dataset.expansionId);
            const expName = item.dataset.expansionName;
            const expCode = item.dataset.expansionCode;
            
            const selectedMatch = matches.find(m => m.id === bpId);
            elements.globalCardSearch.value = selectedMatch.name;
            elements.globalCardDropdown.classList.remove('active');
            
            // Set state selected expansion
            state.selectedExpansion = {
                id: expId,
                name: expName,
                code: expCode
            };
            
            selectBlueprint(selectedMatch);
        });
    });
}

let indexingStatusInterval = null;

function startIndexingStatusPolling() {
    if (indexingStatusInterval) clearInterval(indexingStatusInterval);
    updateIndexingStatus();
    indexingStatusInterval = setInterval(updateIndexingStatus, 5000);
}

async function updateIndexingStatus() {
    try {
        const data = await fetchAPI('/api/index-status');
        
        const dot = elements.indexingStatusMsg.querySelector('.indexing-dot');
        dot.className = 'indexing-dot';
        
        if (data.status === 'indexing' || data.status === 'indexing_fetching' || data.status === 'loading_expansions') {
            dot.classList.add('indexing');
            elements.indexingStatusMsg.innerHTML = `<span class="indexing-dot indexing"></span> Indicizzazione espansioni: ${data.cachedExpansions}/${data.totalExpansions} in cache (Ricerca globale parziale)...`;
        } else if (data.status === 'completed') {
            dot.classList.add('completed');
            elements.indexingStatusMsg.innerHTML = `<span class="indexing-dot completed"></span> Ricerca globale pronta (${data.cachedExpansions} espansioni indicizzate).`;
        } else if (data.status === 'idle_no_token' || data.status === 'paused_no_token') {
            dot.classList.add('idle_no_token');
            elements.indexingStatusMsg.innerHTML = `<span class="indexing-dot idle_no_token"></span> Indicizzazione in pausa: inserisci un Token API.`;
        } else {
            dot.classList.add('completed');
            elements.indexingStatusMsg.innerHTML = `<span class="indexing-dot completed"></span> Ricerca globale pronta (${data.cachedExpansions} espansioni in cache).`;
        }
    } catch (e) {
        console.error('Error fetching indexing status:', e);
    }
}

// Render Expansion Cards Grid
function renderExpansionCardsGrid(blueprints) {
    if (!elements.expansionCardsGrid) return;
    
    if (!blueprints || blueprints.length === 0) {
        elements.expansionCardsGrid.innerHTML = '<div class="no-listings-message">Nessuna carta trovata in questa espansione.</div>';
        return;
    }
    
    elements.expansionCardsGrid.innerHTML = blueprints.map(bp => {
        const hasImage = !!bp.image_url;
        const numberLabel = getCardDisplayNumber(bp) || bp.version || '';
        
        return `
            <div class="expansion-card-item" data-id="${bp.id}" title="${bp.name}">
                <div class="expansion-card-thumb-wrapper">
                    ${hasImage ? `
                        <img src="${bp.image_url}" class="expansion-card-thumb" alt="${bp.name}" loading="lazy">
                    ` : `
                        <div class="expansion-card-placeholder">
                            <span>🃏</span>
                        </div>
                    `}
                </div>
                <div class="expansion-card-info">
                    <div class="expansion-card-name">${bp.name}</div>
                    ${numberLabel ? `<div class="expansion-card-number">${numberLabel}</div>` : ''}
                </div>
            </div>
        `;
    }).join('');
    
    // Add click event listeners to grid items
    elements.expansionCardsGrid.querySelectorAll('.expansion-card-item').forEach(item => {
        item.addEventListener('click', () => {
            const bpId = parseInt(item.dataset.id);
            const selected = blueprints.find(b => b.id === bpId);
            if (selected) {
                selectBlueprint(selected);
            }
        });
    });
}

// Helper to extract collector number from blueprint
function getCollectorNumber(blueprint) {
    if (blueprint.fixed_properties && blueprint.fixed_properties.collector_number) {
        return blueprint.fixed_properties.collector_number.toString().trim();
    }
    if (blueprint.version) {
        const match = blueprint.version.match(/(\d+)\/(\d+)/);
        if (match) return match[0];
    }
    return '';
}

// Helper to parse collector number into alpha prefix and numeric value
function parseCollectorNumber(numStr) {
    if (!numStr) return { num: Infinity, alpha: '' };
    const match = numStr.match(/^([a-zA-Z]*)(\d+)/);
    if (match) {
        const alphaPrefix = match[1] || '';
        const numericPart = parseInt(match[2], 10);
        return { num: numericPart, alpha: alphaPrefix, full: numStr };
    }
    const anyDigit = numStr.match(/(\d+)/);
    if (anyDigit) {
        return { num: parseInt(anyDigit[1], 10), alpha: '', full: numStr };
    }
    return { num: Infinity, alpha: numStr, full: numStr };
}

// Helper to get a clean, short display number (e.g. "15/62" instead of "15/62 ©1999")
function getCardDisplayNumber(bp) {
    const num = getCollectorNumber(bp);
    if (!num) return '';
    return num.split(' ')[0]; // Ritorna es. "15/62" o "RC15"
}

// Generate CardTrader Link
function getCardTraderLink(id, slug) {
    if (slug) {
        return `https://www.cardtrader.com/it/cards/${slug}`;
    }
    return `https://www.cardtrader.com/it/cards/${id}`;
}

// Sort blueprints by collector number/code
function sortBlueprintsByCode(blueprints) {
    return blueprints.sort((a, b) => {
        const numAStr = getCollectorNumber(a);
        const numBStr = getCollectorNumber(b);
        
        if (!numAStr && !numBStr) {
            return a.name.localeCompare(b.name);
        }
        if (!numAStr) return 1;
        if (!numBStr) return -1;
        
        const parsedA = parseCollectorNumber(numAStr);
        const parsedB = parseCollectorNumber(numBStr);
        
        if (parsedA.alpha !== parsedB.alpha) {
            return parsedA.alpha.localeCompare(parsedB.alpha);
        }
        
        if (parsedA.num !== parsedB.num) {
            return parsedA.num - parsedB.num;
        }
        
        return parsedA.full.localeCompare(parsedB.full);
    });
}

// Render Calculator Expansion Dropdown list
function renderCalcExpansionDropdown(matches) {
    if (matches.length === 0) {
        elements.calcExpansionDropdown.innerHTML = '<div class="dropdown-item">Nessuna espansione trovata</div>';
        elements.calcExpansionDropdown.classList.add('active');
        return;
    }
    
    elements.calcExpansionDropdown.innerHTML = matches.map(exp => `
        <div class="dropdown-item" data-id="${exp.id}" data-name="${exp.name}">
            <span>${exp.name}</span>
            ${exp.code ? `<span class="set-code">${exp.code}</span>` : ''}
        </div>
    `).join('');
    
    elements.calcExpansionDropdown.classList.add('active');
    
    // Handle click on items
    elements.calcExpansionDropdown.querySelectorAll('.dropdown-item').forEach(item => {
        item.addEventListener('click', () => {
            const expId = parseInt(item.dataset.id);
            const expName = item.dataset.name;
            
            elements.calcExpansionSearch.value = expName;
            elements.calcExpansionDropdown.classList.remove('active');
            
            const selected = state.expansions.find(e => e.id === expId);
            selectCalcExpansion(selected);
        });
    });
}

// Select Expansion in Calculator
async function selectCalcExpansion(expansion) {
    state.calcSelectedExpansion = expansion;
    elements.calculateBtn.disabled = true;
    elements.calcResultsSummary.style.display = 'none';
    elements.calcLoading.style.display = 'flex';
    
    try {
        console.log(`Calc: Fetching blueprints for expansion: ${expansion.name} (ID: ${expansion.id})`);
        const blueprints = await fetchAPI(`/api/blueprints?expansion_id=${expansion.id}`);
        
        const blueprintsArray = Array.isArray(blueprints) ? blueprints : (blueprints && Array.isArray(blueprints.array) ? blueprints.array : null);
        
        if (!blueprintsArray) {
            throw new Error("La risposta delle carte non contiene un elenco valido.");
        }
        
        state.calcBlueprints = blueprintsArray;
        // Ordina le carte per codice
        sortBlueprintsByCode(state.calcBlueprints);
        
        elements.calculateBtn.disabled = false;
        console.log(`Calc: Loaded ${state.calcBlueprints.length} blueprints.`);
    } catch (e) {
        console.error('Error fetching expansion cards:', e);
        showToast(`Errore caricamento carte dell'espansione: ${e.message}`, 'error');
    } finally {
        elements.calcLoading.style.display = 'none';
    }
}

// Run Set Completion Calculation
async function runCompletionCalculation() {
    if (!state.calcSelectedExpansion || state.calcBlueprints.length === 0) return;
    
    elements.calcLoading.style.display = 'flex';
    elements.calcResultsSummary.style.display = 'none';
    elements.calculateBtn.disabled = true;
    
    const langFilter = elements.calcFilterLang.value;
    const condFilter = elements.calcFilterCond.value;
    const requireFirstEdition = elements.calcFilterFirstEdition.checked;
    
    try {
        console.log(`Calc: Fetching all marketplace listings for expansion ID: ${state.calcSelectedExpansion.id}`);
        const products = await fetchAPI(`/api/products?expansion_id=${state.calcSelectedExpansion.id}`);
        
        let productsMap = {};
        if (products && typeof products === 'object' && !Array.isArray(products)) {
            if (products.array && typeof products.array === 'object') {
                productsMap = products.array;
            } else {
                productsMap = products;
            }
        } else if (Array.isArray(products)) {
            products.forEach(p => {
                if (p && p.blueprint_id) {
                    if (!productsMap[p.blueprint_id]) productsMap[p.blueprint_id] = [];
                    productsMap[p.blueprint_id].push(p);
                }
            });
        }
        
        state.calcResults = [];
        const condOrder = { 'near mint': 5, 'slightly played': 4, 'moderately played': 3, 'played': 2, 'heavily played': 1, 'poor': 0 };
        
        state.calcBlueprints.forEach(bp => {
            const listings = productsMap[bp.id] || [];
            
            // Filter by language and condition
            const commonFiltered = listings.filter(listing => {
                if (!listing) return false;
                const props = listing.properties_hash;
                
                const langValue = getProperty(props, 'language');
                if (langFilter !== 'all' && (!langValue || langValue.toLowerCase() !== langFilter)) return false;
                
                const condValue = getProperty(props, 'condition');
                if (condFilter !== 'all') {
                    const listingScore = condValue ? (condOrder[condValue.toLowerCase()] ?? 0) : 0;
                    const filterScore = condOrder[condFilter.toLowerCase()] ?? 0;
                    if (listingScore < filterScore) return false;
                }
                
                // First edition filter
                if (requireFirstEdition) {
                    const isFirstEd = getProperty(props, 'first') === true || getProperty(props, 'first') === 'true';
                    if (!isFirstEd) return false;
                }
                
                return true;
            });

            // Separate listings into Normal and Reverse
            const isReverseProp = (props) => getProperty(props, 'reverse') === true || getProperty(props, 'reverse') === 'true';
            
            const normalListings = commonFiltered.filter(l => !isReverseProp(l.properties_hash));
            const reverseListings = commonFiltered.filter(l => isReverseProp(l.properties_hash));

            // Find cheapest Normal
            let cheapestNormal = null;
            let minNormalCents = Infinity;
            normalListings.forEach(l => {
                if (l && l.price && l.price.cents != null && l.price.cents < minNormalCents) {
                    minNormalCents = l.price.cents;
                    cheapestNormal = l;
                }
            });

            // Find cheapest Reverse
            let cheapestReverse = null;
            let minReverseCents = Infinity;
            reverseListings.forEach(l => {
                if (l && l.price && l.price.cents != null && l.price.cents < minReverseCents) {
                    minReverseCents = l.price.cents;
                    cheapestReverse = l;
                }
            });

            const displayCode = getCardDisplayNumber(bp) || '-';
            const hasNormal = cheapestNormal !== null;
            const hasReverse = cheapestReverse !== null;

            let defaultVariant = 'none';
            if (hasNormal && hasReverse) defaultVariant = 'both';
            else if (hasNormal) defaultVariant = 'normal';
            else if (hasReverse) defaultVariant = 'reverse';

            state.calcResults.push({
                id: bp.id,
                slug: bp.slug,
                code: displayCode,
                name: bp.name,
                hasNormal: hasNormal,
                hasReverse: hasReverse,
                normalPriceCents: hasNormal ? minNormalCents : 0,
                reversePriceCents: hasReverse ? minReverseCents : 0,
                normalCond: hasNormal ? (getProperty(cheapestNormal.properties_hash, 'condition') || 'N/D') : '-',
                reverseCond: hasReverse ? (getProperty(cheapestReverse.properties_hash, 'condition') || 'N/D') : '-',
                normalLang: hasNormal ? (getProperty(cheapestNormal.properties_hash, 'language') || 'N/D') : '-',
                reverseLang: hasReverse ? (getProperty(cheapestReverse.properties_hash, 'language') || 'N/D') : '-',
                variantSelection: defaultVariant,
                selected: state.calcGlobalSelectAll
            });
        });
        
        sortCalcResults();
        renderCalcTable();
        elements.calcResultsSummary.style.display = 'block';
    } catch (e) {
        console.error('Error calculating missing cards:', e);
        showToast(`Errore durante il calcolo: ${e.message}`, 'error');
    } finally {
        elements.calcLoading.style.display = 'none';
        elements.calculateBtn.disabled = false;
    }
}

function sortCalcResults() {
    const sortBy = state.calcSort;
    
    state.calcResults.sort((a, b) => {
        if (sortBy.startsWith('code')) {
            // Extract first number for logical numeric sorting (e.g., "004/102" -> 4)
            const matchA = (a.code || '').match(/\d+/);
            const matchB = (b.code || '').match(/\d+/);
            const numA = matchA ? parseInt(matchA[0], 10) : 0;
            const numB = matchB ? parseInt(matchB[0], 10) : 0;
            
            if (numA === numB) {
                return sortBy === 'code_asc' ? a.code.localeCompare(b.code) : b.code.localeCompare(a.code);
            }
            return sortBy === 'code_asc' ? numA - numB : numB - numA;
            
        } else if (sortBy.startsWith('name')) {
            return sortBy === 'name_asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
            
        } else if (sortBy.startsWith('price')) {
            // Calculate effective minimum price for sorting
            const getMinPrice = (row) => {
                if (!row.hasNormal && !row.hasReverse) return Infinity; // Put unavailable cards at the bottom for asc
                let prices = [];
                if (row.hasNormal && row.normalPriceCents > 0) prices.push(row.normalPriceCents);
                if (row.hasReverse && row.reversePriceCents > 0) prices.push(row.reversePriceCents);
                return prices.length > 0 ? Math.min(...prices) : Infinity;
            };
            
            const pA = getMinPrice(a);
            const pB = getMinPrice(b);
            
            if (pA === pB) return a.code.localeCompare(b.code); // Fallback to code if prices are equal
            return sortBy === 'price_asc' ? pA - pB : pB - pA;
        }
        return 0;
    });
}

function renderCalcTable() {
    let totalCostCents = 0;
    let cardsFoundCount = 0; // Counts how many "slots" we found
    let selectedCount = 0;   // Counts how many "slots" are selected
    let totalExpectedCards = 0; // To show out of X

    // Calculate totals based on selection
    state.calcResults.forEach(row => {
        if (row.variantSelection === 'both') {
            totalExpectedCards += 2; // Normal and Reverse
            cardsFoundCount += 2;
            if (row.selected) {
                totalCostCents += row.normalPriceCents + row.reversePriceCents;
                selectedCount += 2;
            }
        } else if (row.variantSelection === 'normal' || row.variantSelection === 'reverse') {
            totalExpectedCards += 1;
            cardsFoundCount += 1;
            if (row.selected) {
                totalCostCents += (row.variantSelection === 'normal') ? row.normalPriceCents : row.reversePriceCents;
                selectedCount += 1;
            }
        } else {
            // Missing entirely
            totalExpectedCards += 1;
        }
    });

    const currencySym = '€';
    elements.calcTotalCost.textContent = `${currencySym} ${(totalCostCents / 100).toFixed(2)}`;
    elements.calcCardsFound.textContent = `${selectedCount} sez. su ${cardsFoundCount} trovate`;
    
    const avgPrice = selectedCount > 0 ? (totalCostCents / selectedCount / 100) : 0;
    elements.calcAvgCardPrice.textContent = `${currencySym} ${avgPrice.toFixed(2)}`;

    // Set global checkbox state
    if (elements.calcSelectAll) {
        elements.calcSelectAll.checked = state.calcGlobalSelectAll;
        elements.calcSelectAll.onchange = (e) => {
            state.calcGlobalSelectAll = e.target.checked;
            state.calcResults.forEach(r => {
                if (r.variantSelection !== 'none') r.selected = state.calcGlobalSelectAll;
            });
            renderCalcTable();
        };
    }

    // Render table rows
    elements.calcCardsTbody.innerHTML = state.calcResults.map((row, index) => {
        const isMissing = row.variantSelection === 'none';
        
        let priceHtml = '';
        let condHtml = '';
        let langHtml = '';
        
        if (isMissing) {
            priceHtml = '<span class="not-available-badge">N/D</span>';
            condHtml = '-';
            langHtml = '-';
        } else {
            let nPrice = `${currencySym} ${(row.normalPriceCents / 100).toFixed(2)}`;
            let rPrice = `${currencySym} ${(row.reversePriceCents / 100).toFixed(2)}`;
            
            if (row.variantSelection === 'both') {
                priceHtml = `
                    <div style="font-size: 0.8rem; opacity: 0.8;">N: ${nPrice}</div>
                    <div style="font-size: 0.8rem; opacity: 0.8;">R: ${rPrice}</div>
                    <div style="font-weight: bold; margin-top: 2px;">Tot: ${currencySym} ${((row.normalPriceCents + row.reversePriceCents) / 100).toFixed(2)}</div>
                `;
                condHtml = `<div style="font-size: 0.8rem">N: ${row.normalCond}</div><div style="font-size: 0.8rem">R: ${row.reverseCond}</div>`;
                langHtml = `<div style="font-size: 0.8rem">N: ${row.normalLang}</div><div style="font-size: 0.8rem">R: ${row.reverseLang}</div>`;
            } else if (row.variantSelection === 'normal') {
                priceHtml = `<span class="price-text">${nPrice}</span>`;
                condHtml = `<span class="cond-badge">${row.normalCond}</span>`;
                langHtml = `<span class="lang-badge">${row.normalLang}</span>`;
            } else if (row.variantSelection === 'reverse') {
                priceHtml = `<span class="price-text">${rPrice}</span>`;
                condHtml = `<span class="cond-badge">${row.reverseCond}</span>`;
                langHtml = `<span class="lang-badge">${row.reverseLang}</span>`;
            }
        }
        
        let selectHtml = '';
        if (!isMissing) {
            selectHtml = `<select class="variant-select" data-index="${index}" style="width: 130px; font-size: 0.8rem; padding: 2px;">`;
            if (row.hasNormal && row.hasReverse) {
                selectHtml += `<option value="both" ${row.variantSelection === 'both' ? 'selected' : ''}>Entrambe (N+R)</option>`;
            }
            if (row.hasNormal) {
                selectHtml += `<option value="normal" ${row.variantSelection === 'normal' ? 'selected' : ''}>Solo Normale</option>`;
            }
            if (row.hasReverse) {
                selectHtml += `<option value="reverse" ${row.variantSelection === 'reverse' ? 'selected' : ''}>Solo Reverse</option>`;
            }
            selectHtml += `</select>`;
        } else {
            selectHtml = '-';
        }
        
        let link = getCardTraderLink(row.id, row.slug);
        
        return `
            <tr class="${isMissing ? 'missing-row' : ''} ${!row.selected && !isMissing ? 'unselected-row' : ''}">
                <td style="text-align: center;">
                    <input type="checkbox" class="calc-row-cb" data-index="${index}" ${row.selected ? 'checked' : ''} ${isMissing ? 'disabled' : ''}>
                </td>
                <td style="font-weight: 600;">${row.code}</td>
                <td style="${!row.selected && !isMissing ? 'text-decoration: line-through; opacity: 0.6;' : ''}">
                    <a href="${link}" target="_blank" class="ct-table-link" title="Apri su CardTrader">${row.name}</a>
                </td>
                <td>
                    <div style="${!row.selected ? 'opacity: 0.5;' : ''}">${priceHtml}</div>
                </td>
                <td>${condHtml}</td>
                <td>${langHtml}</td>
                <td>${selectHtml}</td>
            </tr>
        `;
    }).join('');

    // Attach event listeners
    elements.calcCardsTbody.querySelectorAll('.calc-row-cb').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const index = parseInt(e.target.dataset.index, 10);
            if (state.calcResults[index]) {
                state.calcResults[index].selected = e.target.checked;
                renderCalcTable();
            }
        });
    });

    elements.calcCardsTbody.querySelectorAll('.variant-select').forEach(sel => {
        sel.addEventListener('change', (e) => {
            const index = parseInt(e.target.dataset.index, 10);
            if (state.calcResults[index]) {
                state.calcResults[index].variantSelection = e.target.value;
                renderCalcTable();
            }
        });
    });
}

// --- Wishlist Logic ---

function isFavorite(blueprintId) {
    return state.wishlist.some(item => item.id === blueprintId);
}

function updateWishlistButton(blueprintId) {
    if (!elements.wishlistBtn) return;
    if (isFavorite(blueprintId)) {
        elements.wishlistBtn.classList.add('active');
        elements.wishlistBtn.textContent = '❤️';
    } else {
        elements.wishlistBtn.classList.remove('active');
        elements.wishlistBtn.textContent = '🤍';
    }
}

function toggleFavorite(blueprint) {
    if (!blueprint) return;
    
    const index = state.wishlist.findIndex(item => item.id === blueprint.id);
    if (index >= 0) {
        state.wishlist.splice(index, 1);
    } else {
        state.wishlist.push({
            id: blueprint.id,
            name: blueprint.name,
            version: blueprint.version,
            image_url: blueprint.image_url,
            game_id: state.gameId, // Store current game ID so we can group them
            game_name: getGameName(state.gameId),
            slug: blueprint.slug,
            added_at: Date.now()
        });
    }
    
    localStorage.setItem('pokeprice_wishlist', JSON.stringify(state.wishlist));
    updateWishlistButton(blueprint.id);
    elements.wishlistCount.textContent = state.wishlist.length;
}

function getGameName(gameId) {
    const map = {
        5: 'Pokémon',
        4: 'Yu-Gi-Oh!',
        1: 'Magic',
        15: 'One Piece'
    };
    return map[gameId] || 'Altro';
}

function renderWishlist(activeGameId = null) {
    elements.wishlistCount.textContent = state.wishlist.length;
    
    if (state.wishlist.length === 0) {
        elements.wishlistGrid.innerHTML = '';
        elements.wishlistGameTabs.innerHTML = '';
        elements.wishlistEmpty.style.display = 'block';
        return;
    }
    
    elements.wishlistEmpty.style.display = 'none';
    
    // Group by game
    const gamesPresent = [...new Set(state.wishlist.map(i => i.game_id))];
    
    // Determine active tab
    if (!activeGameId || !gamesPresent.includes(activeGameId)) {
        activeGameId = gamesPresent[0]; // default to first available
    }
    
    // Render Game Tabs
    elements.wishlistGameTabs.innerHTML = gamesPresent.map(gId => {
        const isActive = gId === activeGameId ? 'active' : '';
        const name = getGameName(gId);
        const count = state.wishlist.filter(i => i.game_id === gId).length;
        return `<button class="wishlist-game-tab ${isActive}" data-game-id="${gId}">${name} (${count})</button>`;
    }).join('');
    
    // Add tab click listeners
    elements.wishlistGameTabs.querySelectorAll('.wishlist-game-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            const gId = parseInt(e.target.dataset.gameId, 10);
            renderWishlist(gId);
        });
    });
    
    // Filter items for active game
    const itemsToShow = state.wishlist.filter(item => item.game_id === activeGameId);
    
    // Render grid using same style as expansion-cards-grid
    elements.wishlistGrid.innerHTML = itemsToShow.map(bp => {
        const hasImage = !!bp.image_url;
        const numberLabel = bp.version || '';
        
        return `
            <div class="expansion-card-item" data-id="${bp.id}" title="${bp.name}">
                <div class="expansion-card-thumb-wrapper">
                    ${hasImage ? `
                        <img src="${bp.image_url}" class="expansion-card-thumb" alt="${bp.name}" loading="lazy">
                    ` : `
                        <div class="expansion-card-placeholder">
                            <span>🃏</span>
                        </div>
                    `}
                </div>
                <div class="expansion-card-info">
                    <div class="expansion-card-name">${bp.name}</div>
                    ${numberLabel ? `<div class="expansion-card-number">${numberLabel}</div>` : ''}
                </div>
                <button class="remove-fav-btn" data-id="${bp.id}" style="position: absolute; top: 5px; right: 5px; background: rgba(0,0,0,0.7); border: none; border-radius: 50%; width: 24px; height: 24px; color: white; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 12px; z-index: 2;">❌</button>
            </div>
        `;
    }).join('');
    
    // Listeners for cards
    elements.wishlistGrid.querySelectorAll('.expansion-card-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.closest('.remove-fav-btn')) return; // handled below
            
            const bpId = parseInt(item.dataset.id);
            const selected = state.wishlist.find(b => b.id === bpId);
            if (selected) {
                // To display it, we switch to global search mode roughly
                // But wait, selectBlueprint expects full blueprint.
                // We'll mock the expansion name for display.
                state.selectedExpansion = { name: selected.game_name, code: '-' };
                
                // We also need to switch game if it's different so API uses correct token/context
                if (state.gameId !== selected.game_id) {
                    const gameBtn = document.querySelector(`.game-btn[data-game-id="${selected.game_id}"]`);
                    if (gameBtn) gameBtn.click();
                }
                
                // Set search mode global
                elements.tabGlobal.click();
                
                // Fetch the blueprint from API or use the saved one
                // Since we only need products, selectBlueprint just needs id, name, version, image_url, category_id
                selectBlueprint({
                    id: selected.id,
                    name: selected.name,
                    version: selected.version,
                    image_url: selected.image_url,
                    slug: selected.slug,
                    category_id: null
                });
            }
        });
    });
    
    // Remove listeners
    elements.wishlistGrid.querySelectorAll('.remove-fav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const bpId = parseInt(btn.dataset.id, 10);
            toggleFavorite({ id: bpId });
            renderWishlist(activeGameId); // Re-render
        });
    });
}


// ==========================================
// TOAST NOTIFICATIONS
// ==========================================
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';
    if (type === 'warning') icon = '⚠️';
    
    toast.innerHTML = `
        <div class="toast-icon">${icon}</div>
        <div class="toast-content">${message}</div>
    `;
    
    container.appendChild(toast);
    
    // Trigger animation
    setTimeout(() => toast.classList.add('show'), 10);
    
    // Remove after 4 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        toast.classList.add('hiding');
        setTimeout(() => toast.remove(), 400); // Wait for transition
    }, 4000);
}
