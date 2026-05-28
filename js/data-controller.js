// KO: 데이터 로딩/캐시와 화면 모드 전환 흐름을 관리합니다.
// EN: Manage data loading/caching and view-mode switching flow.
export function createDataController(deps) {
  const {
    state,
    el,
    indexUrl,
    categoryIndexUrl,
    updateIssueNavVisibility,
    renderIssueNav,
    renderCategoryOptions,
    renderIssuePdfLink,
    renderArticleList,
    renderArticleDetail,
    renderCornerList,
    renderCornerFilterOptions
  } = deps;

  // KO: 기본 인덱스를 읽어 호수 목록 상태를 초기화합니다.
  // EN: Load the main index and initialize issue state.
  async function loadData() {
    try {
      const response = await fetch(`${indexUrl}?t=${Date.now()}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      state.payload = await response.json();
    } catch {
      el.heroMeta.textContent = "데이터 없음 · npm run build:data 를 먼저 실행해주세요.";
      return;
    }

    state.issues = Array.isArray(state.payload.issues) ? state.payload.issues : [];
    state.issues.sort((a, b) => b.issueNo - a.issueNo);

    if (state.issues[0]) {
      state.selectedIssueId = String(state.issues[0].webzineId);
    }
  }

  // KO: 특정 호수로 전환하고 관련 목록/본문 상태를 갱신합니다.
  // EN: Switch to a target issue and refresh list/detail state.
  async function switchIssue(webzineId) {
    const key = String(webzineId);
    state.selectedIssueId = key;
    state.isLoadingIssue = true;
    updateIssueNavVisibility();
    renderIssueNav();
    renderCategoryOptions();
    renderIssuePdfLink();
    renderArticleList();

    await loadIssueData(key);

    state.articles = state.loadedIssues.get(key) || [];
    state.isLoadingIssue = false;

    if (!state.articles.some((a) => a.id === state.selectedArticleId)) {
      state.selectedArticleId = state.articles[0]?.id || null;
    }

    if (state.viewMode === "corner") renderCornerList();
    renderCategoryOptions();
    renderArticleList();
    renderArticleDetail();
  }

  // KO: 호수 JSON을 읽어 기사 캐시에 저장합니다.
  // EN: Load one issue JSON and cache its articles.
  async function loadIssueData(webzineId) {
    const key = String(webzineId);
    if (state.loadedIssues.has(key)) return;

    const issueMeta = state.issues.find((i) => String(i.webzineId) === key);
    if (!issueMeta?.filePath) return;

    const response = await fetch(`data/${issueMeta.filePath}?t=${Date.now()}`);
    const data = await response.json();
    const articles = data.articles.map((article) => ({
      ...article,
      issueId: key,
      issueNo: data.issueNo,
      issueLabel: data.issueLabel,
      issueDateLabel: data.dateLabel,
      coverUrl: data.coverUrl,
      searchBlob: `${article.title} ${article.author} ${article.category} ${article.bodyText}`.toLowerCase()
    }));
    articles.sort((a, b) => a.order - b.order);
    state.loadedIssues.set(key, articles);
  }

  // KO: 호수 모드/코너 모드를 전환하고 화면 상태를 맞춥니다.
  // EN: Switch between issue and corner modes and align UI state.
  function switchViewMode(mode) {
    if (state.viewMode === mode) return;
    state.viewMode = mode;
    state.selectedCorner = "";
    state.selectedArticleId = null;

    if (el.cornerFilterField) {
      el.cornerFilterField.hidden = mode !== "corner";
    }
    if (el.categoryField) {
      el.categoryField.hidden = mode === "corner";
    }
    el.tabIssue.classList.toggle("is-active", mode === "issue");
    el.tabCorner.classList.toggle("is-active", mode === "corner");
    el.issuePanel.classList.toggle("is-corner-mode", mode === "corner");
    el.listTitle.textContent = mode === "corner" ? "코너별 제목" : "기사 목록";
    updateIssueNavVisibility();
    el.issueCoverWrap.hidden = mode === "corner" || !currentIssue()?.coverUrl;
    el.cornerList.hidden = mode === "issue";

    if (mode === "corner") {
      state.isLoadingCorner = true;
      renderCornerList();
      renderCategoryOptions();
      renderArticleList();
      renderArticleDetail();
      initializeCornerMode().then(() => {
        state.isLoadingCorner = false;
        renderCornerFilterOptions();
        renderCornerList();
        renderArticleList();
        renderArticleDetail();
      }).catch(() => {
        state.isLoadingCorner = false;
        renderCornerFilterOptions();
        renderCornerList();
        renderArticleList();
        renderArticleDetail();
      });
      return;
    }

    renderIssueNav();
    renderCategoryOptions();
    renderIssuePdfLink();
    renderArticleList();
    renderArticleDetail();
  }

  // KO: 코너 모드 진입 시 기본 코너와 목록 데이터를 준비합니다.
  // EN: Prepare default corner and list data when entering corner mode.
  async function initializeCornerMode() {
    await loadCategoryIndex();
    if (!state.selectedCorner) {
      state.selectedCorner = getDefaultCorner();
    }
    await ensureSelectedCornerLoaded();
  }

  // KO: 카테고리 인덱스를 한 번만 로드해 캐시합니다.
  // EN: Load and cache the category index once.
  async function loadCategoryIndex() {
    if (state.categoryIndex) {
      return;
    }

    const response = await fetch(`${categoryIndexUrl}?t=${Date.now()}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    state.categoryIndex = await response.json();
  }

  // KO: 카테고리 엔트리 목록을 안전하게 반환합니다.
  // EN: Return category entries in a safe array form.
  function getCategoryEntries() {
    const categories = state.categoryIndex?.categories;
    return Array.isArray(categories) ? categories : [];
  }

  // KO: 카테고리 이름으로 인덱스 엔트리를 찾습니다.
  // EN: Find a category index entry by category name.
  function findCategoryEntryByName(categoryName) {
    return getCategoryEntries().find((entry) => entry.category === categoryName) || null;
  }

  // KO: 카테고리별 기사 JSON을 로드하고 캐시합니다.
  // EN: Load and cache category-specific article JSON.
  async function loadCategoryArticlesByName(categoryName) {
    const normalized = String(categoryName || "").trim();
    if (!normalized) {
      return [];
    }

    if (state.loadedCategoryArticles.has(normalized)) {
      return state.loadedCategoryArticles.get(normalized) || [];
    }

    if (state.categoryLoadPromises.has(normalized)) {
      return state.categoryLoadPromises.get(normalized);
    }

    const loadPromise = (async () => {
      await loadCategoryIndex();
      const entry = findCategoryEntryByName(normalized);
      if (!entry?.filePath) {
        state.loadedCategoryArticles.set(normalized, []);
        return [];
      }

      const response = await fetch(`data/${entry.filePath}?t=${Date.now()}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = await response.json();
      const articles = (Array.isArray(payload.articles) ? payload.articles : []).map((article) => ({
        ...article,
        searchBlob: `${article.title || ""} ${article.author || ""} ${article.category || ""} ${article.summary || ""}`.toLowerCase()
      }));
      state.loadedCategoryArticles.set(normalized, articles);
      return articles;
    })();

    state.categoryLoadPromises.set(normalized, loadPromise);

    try {
      return await loadPromise;
    } finally {
      state.categoryLoadPromises.delete(normalized);
    }
  }

  // KO: 선택된 코너의 기사와 원본 호수 데이터를 보장합니다.
  // EN: Ensure selected corner articles and source issue data are loaded.
  async function ensureSelectedCornerLoaded() {
    if (!state.selectedCorner) {
      return;
    }

    const pinnedCorner = "도전님 훈시";
    const categoriesToLoad = state.cornerFilter !== "all"
      ? [...new Set([state.selectedCorner, pinnedCorner].filter(Boolean))]
      : [state.selectedCorner];

    const loadedLists = await Promise.all(categoriesToLoad.map((category) => loadCategoryArticlesByName(category)));
    const list = loadedLists[0] || [];
    if (!list.some((article) => article.id === state.selectedArticleId)) {
      state.selectedArticleId = list[0]?.id || null;
    }

    const selected = list.find((article) => article.id === state.selectedArticleId);
    if (selected?.webzineId) {
      await loadIssueData(String(selected.webzineId));
    }
  }

  // KO: 코너 목록을 정렬하고 고정 코너를 맨 앞으로 배치합니다.
  // EN: Sort corner categories and pin the fixed corner to the top.
  function getCornerCategories() {
    const pinnedCorner = "도전님 훈시";
    const categories = [...new Set(getCategoryEntries().map((entry) => entry.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko"));
    const pinnedIndex = categories.indexOf(pinnedCorner);
    if (pinnedIndex > 0) {
      categories.splice(pinnedIndex, 1);
      categories.unshift(pinnedCorner);
    }
    return categories;
  }

  // KO: 현재 필터 기준으로 노출할 코너 목록을 계산합니다.
  // EN: Compute visible corner categories based on the current filter.
  function getVisibleCornerCategories() {
    const pinnedCorner = "도전님 훈시";
    const categories = getCornerCategories();
    if (state.cornerFilter === "all") {
      return categories;
    }

    return categories.filter((category) => category === pinnedCorner || category === state.cornerFilter);
  }

  // KO: 코너 아코디언 항목의 펼침 여부를 판단합니다.
  // EN: Determine whether a corner accordion section should expand.
  function shouldExpandCorner(category) {
    const pinnedCorner = "도전님 훈시";
    return state.selectedCorner === category || (state.cornerFilter !== "all" && category === pinnedCorner);
  }

  // KO: 기본 선택 코너를 반환합니다.
  // EN: Return the default corner selection.
  function getDefaultCorner() {
    const categories = getCornerCategories();
    return categories[0] || "";
  }

  // KO: 현재 선택된 호수 메타를 반환합니다.
  // EN: Return metadata for the currently selected issue.
  function currentIssue() {
    if (state.selectedIssueId === "all") {
      return null;
    }

    return state.issues.find((issue) => String(issue.webzineId) === state.selectedIssueId) || null;
  }

  // KO: 현재 모드 기준의 기사 원본 목록을 반환합니다.
  // EN: Return the base article list for the current mode.
  function filteredArticlesForIssue() {
    if (state.viewMode === "corner") {
      if (!state.selectedCorner) {
        return [];
      }
      return state.loadedCategoryArticles.get(state.selectedCorner) || [];
    }
    return state.articles;
  }

  // KO: 카테고리/검색 조건을 적용한 기사 목록을 반환합니다.
  // EN: Return articles filtered by category and search query.
  function filteredArticles() {
    return filteredArticlesForIssue().filter((article) => {
      if (state.viewMode === "issue" && state.selectedCategory !== "all" && article.category !== state.selectedCategory) {
        return false;
      }

      if (state.query && !article.searchBlob.includes(state.query)) {
        return false;
      }

      return true;
    });
  }

  return {
    loadData,
    switchIssue,
    loadIssueData,
    switchViewMode,
    initializeCornerMode,
    loadCategoryIndex,
    getCategoryEntries,
    findCategoryEntryByName,
    loadCategoryArticlesByName,
    ensureSelectedCornerLoaded,
    getCornerCategories,
    getVisibleCornerCategories,
    shouldExpandCorner,
    getDefaultCorner,
    currentIssue,
    filteredArticlesForIssue,
    filteredArticles
  };
}