import { createViewController } from "./js/view-controller.js";
import { createDataController } from "./js/data-controller.js";

const INDEX_URL = "data/index.json";
const CATEGORY_INDEX_URL = "data/categories/index.json";

const state = {
  payload: null,
  issues: [],
  articles: [],
  loadedIssues: new Map(),
  categoryIndex: null,
  loadedCategoryArticles: new Map(),
  categoryLoadPromises: new Map(),
  isLoadingIssue: false,
  isLoadingCorner: false,
  selectedIssueId: "all",
  selectedCategory: "all",
  cornerFilter: "all",
  selectedArticleId: null,
  viewMode: "issue",
  selectedCorner: "",
  query: "",
  isMobileIssuePanelOpen: false,
  lastRenderedArticleId: null
};

const el = {
  heroMeta: document.querySelector("#heroMeta"),
  resultMeta: document.querySelector("#resultMeta"),
  articleList: document.querySelector("#articleList"),
  articleEmpty: document.querySelector("#articleEmpty"),
  articleView: document.querySelector("#articleView"),
  articleIssue: document.querySelector("#articleIssue"),
  articleCategory: document.querySelector("#articleCategory"),
  articleTitle: document.querySelector("#articleTitle"),
  articleAuthor: document.querySelector("#articleAuthor"),
  articleBody: document.querySelector("#articleBody"),
  articleSourceLink: document.querySelector("#articleSourceLink"),
  issuePdfLink: document.querySelector("#issuePdfLink"),
  searchInput: document.querySelector("#searchInput"),
  categorySelect: document.querySelector("#categorySelect"),
  categoryField: document.querySelector("#categoryField"),
  cornerFilterSelect: document.querySelector("#cornerFilterSelect"),
  cornerFilterField: document.querySelector("#cornerFilterField"),
  tabIssue: document.querySelector("#tabIssue"),
  tabCorner: document.querySelector("#tabCorner"),
  listTitle: document.querySelector("#listTitle"),
  cornerList: document.querySelector("#cornerList"),
  mobileIssuePanelToggle: document.querySelector("#mobileIssuePanelToggle"),
  issuePanel: document.querySelector("#issuePanel"),
  readerPanel: document.querySelector(".reader-panel"),
  issueNav: document.querySelector("#issueNav"),
  prevIssueBtn: document.querySelector("#prevIssueBtn"),
  nextIssueBtn: document.querySelector("#nextIssueBtn"),
  issueSelect: document.querySelector("#issueSelect"),
  issueCoverWrap: document.querySelector("#issueCoverWrap"),
  issueCoverImg: document.querySelector("#issueCoverImg"),
  issueCoverToggle: document.querySelector("#issueCoverToggle"),
  quickNav: document.querySelector("#quickNav"),
  quickToListTopBtn: document.querySelector("#quickToListTopBtn"),
  quickToTopBtn: document.querySelector("#quickToTopBtn"),
  quickToMenuBtn: document.querySelector("#quickToMenuBtn")
};

let viewController;
let dataController;

dataController = createDataController({
  state,
  el,
  indexUrl: INDEX_URL,
  categoryIndexUrl: CATEGORY_INDEX_URL,
  updateIssueNavVisibility,
  renderIssueNav,
  renderCategoryOptions,
  renderIssuePdfLink,
  renderArticleList,
  renderArticleDetail,
  renderCornerList,
  renderCornerFilterOptions
});

viewController = createViewController({
  state,
  el,
  currentIssue,
  filteredArticlesForIssue,
  filteredArticles,
  getCornerCategories,
  getVisibleCornerCategories,
  shouldExpandCorner,
  getDefaultCorner,
  ensureSelectedCornerLoaded,
  loadIssueData,
  setMobileIssuePanelOpen,
  scrollReaderIntoViewIfMobile,
  resetArticleScrollPosition,
  updateQuickNavVisibility,
  escapeHtml,
  escapeAttribute
});

boot();

// [KO] 앱 초기 렌더 흐름을 실행하고 기본 화면 상태를 구성합니다.
// [EN] Runs initial app bootstrap flow and sets up the default screen state.
async function boot() {
  updateIssueNavVisibility();
  bindEvents();
  await loadData();
  if (!state.payload) return;
  updateHero();
  renderIssueNav();
  renderIssuePdfLink();
  if (state.selectedIssueId && state.selectedIssueId !== "all") {
    await switchIssue(state.selectedIssueId);
  } else {
    renderCategoryOptions();
    renderArticleList();
    renderArticleDetail();
  }

  updateIssueNavVisibility();
}

// [KO] 화면 상호작용 이벤트를 한 곳에서 연결합니다.
// [EN] Binds all UI interaction events in one place.
function bindEvents() {
  el.mobileIssuePanelToggle.addEventListener("click", () => {
    setMobileIssuePanelOpen(!state.isMobileIssuePanelOpen);
  });

  el.prevIssueBtn.addEventListener("click", async () => {
    const idx = state.issues.findIndex((i) => String(i.webzineId) === state.selectedIssueId);
    if (idx < state.issues.length - 1) await switchIssue(state.issues[idx + 1].webzineId);
  });

  el.nextIssueBtn.addEventListener("click", async () => {
    const idx = state.issues.findIndex((i) => String(i.webzineId) === state.selectedIssueId);
    if (idx > 0) await switchIssue(state.issues[idx - 1].webzineId);
  });

  el.issueSelect.addEventListener("change", async () => {
    await switchIssue(el.issueSelect.value);
    if (window.innerWidth <= 1100) setMobileIssuePanelOpen(false);
  });

  el.issueCoverToggle.addEventListener("click", () => {
    const isHidden = el.issueCoverImg.hidden;
    el.issueCoverImg.hidden = !isHidden;
    el.issueCoverToggle.textContent = isHidden ? "표지 ▴" : "표지 ▾";
  });

  el.searchInput.addEventListener("input", () => {
    state.query = el.searchInput.value.trim().toLowerCase();
    renderArticleList();
  });

  el.categorySelect.addEventListener("change", () => {
    state.selectedCategory = el.categorySelect.value;
    renderArticleList();
  });

  el.cornerFilterSelect?.addEventListener("change", () => {
    // 코너 필터 변경 시 선택 코너를 필터 범위에 맞게 재설정.
    state.cornerFilter = el.cornerFilterSelect.value;
    const visibleCategories = getVisibleCornerCategories();
    const pinnedCorner = "도전님 훈시";
    if (state.cornerFilter !== "all") {
      // 특정 필터 선택 시 해당 코너를 우선 선택해 바로 내용을 확인할 수 있게 한다.
      state.selectedCorner = state.cornerFilter;
      state.selectedArticleId = null;
    } else if (!visibleCategories.includes(state.selectedCorner)) {
      state.selectedCorner = visibleCategories[0] || pinnedCorner;
      state.selectedArticleId = null;
    }

    renderCornerList();
    ensureSelectedCornerLoaded().then(() => {
      renderCornerList();
      renderArticleDetail();
    });
  });

  el.tabIssue.addEventListener("click", () => switchViewMode("issue"));
  el.tabCorner.addEventListener("click", () => switchViewMode("corner"));

  window.addEventListener("resize", () => {
    if (window.innerWidth > 1100 && state.isMobileIssuePanelOpen) {
      setMobileIssuePanelOpen(false);
    }

    updateIssueNavVisibility();
    updateQuickNavVisibility();
  });

  // 본문이 길 때 빠른 이동 버튼 노출 상태를 스크롤에 맞춰 갱신한다.
  window.addEventListener("scroll", updateQuickNavVisibility, { passive: true });
  el.articleBody.addEventListener("scroll", updateQuickNavVisibility, { passive: true });
  el.articleList.addEventListener("scroll", updateQuickNavVisibility, { passive: true });
  el.issuePanel.addEventListener("scroll", updateQuickNavVisibility, { passive: true });

  el.quickToListTopBtn?.addEventListener("click", () => {
    scrollArticleListTop();
  });

  el.quickToTopBtn?.addEventListener("click", () => {
    scrollArticleTop();
  });

  el.quickToMenuBtn?.addEventListener("click", () => {
    scrollToTopMenu();
  });
}

// [KO] 반응형 조건에 따라 호수 네비게이션 노출 상태를 갱신합니다.
// [EN] Updates issue navigation visibility based on responsive conditions.
function updateIssueNavVisibility() {
  return viewController.updateIssueNavVisibility();
}

// [KO] 모바일 호수 패널의 열림/닫힘 상태를 전환합니다.
// [EN] Toggles open/closed state of the mobile issue panel.
function setMobileIssuePanelOpen(isOpen) {
  return viewController.setMobileIssuePanelOpen(isOpen);
}

// [KO] 모바일에서 리더 패널이 보이도록 화면을 맞춥니다.
// [EN] Ensures the reader panel is visible on mobile.
function scrollReaderIntoViewIfMobile() {
  return viewController.scrollReaderIntoViewIfMobile();
}

// [KO] 본문 영역의 현재 스크롤 위치를 조회합니다.
// [EN] Returns current scroll position of the article area.
function articleScrollTop() {
  return viewController.articleScrollTop();
}

// [KO] 목록 영역의 현재 스크롤 위치를 조회합니다.
// [EN] Returns current scroll position of the article list area.
function articleListScrollTop() {
  return viewController.articleListScrollTop();
}

// [KO] 빠른 이동 버튼 노출 여부를 현재 스크롤 기준으로 갱신합니다.
// [EN] Refreshes quick navigation visibility based on scroll state.
function updateQuickNavVisibility() {
  return viewController.updateQuickNavVisibility();
}

// [KO] 기사 목록을 최상단으로 스크롤합니다.
// [EN] Scrolls the article list to the top.
function scrollArticleListTop() {
  return viewController.scrollArticleListTop();
}

// [KO] 기사 본문을 최상단으로 스크롤합니다.
// [EN] Scrolls article content to the top.
function scrollArticleTop() {
  return viewController.scrollArticleTop();
}

// [KO] 페이지 상단 메뉴 위치로 스크롤합니다.
// [EN] Scrolls to the top menu position.
function scrollToTopMenu() {
  return viewController.scrollToTopMenu();
}

// [KO] 본문이 바뀔 때 데스크톱/모바일 환경에 맞춰 읽기 위치를 상단으로 초기화합니다.
// [EN] Reset reading position to the top when article content changes, for desktop and mobile.
function resetArticleScrollPosition() {
  return viewController.resetArticleScrollPosition();
}

// [KO] 인덱스 데이터를 로드해 기본 상태를 초기화합니다.
// [EN] Loads index data and initializes base state.
async function loadData() {
  return dataController.loadData();
}

// [KO] 선택한 호수로 전환하고 관련 화면을 갱신합니다.
// [EN] Switches to selected issue and refreshes related views.
async function switchIssue(webzineId) {
  return dataController.switchIssue(webzineId);
}

// [KO] 특정 호수의 상세 데이터를 필요 시 로드합니다.
// [EN] Loads detailed data for a specific issue when needed.
async function loadIssueData(webzineId) {
  return dataController.loadIssueData(webzineId);
}

// [KO] 보기 모드를 호별/코너별로 전환합니다.
// [EN] Switches view mode between issue and corner.
function switchViewMode(mode) {
  return dataController.switchViewMode(mode);
}

// [KO] 코너 모드 진입 시 초기 선택 상태를 준비합니다.
// [EN] Prepares initial selection state when entering corner mode.
async function initializeCornerMode() {
  return dataController.initializeCornerMode();
}

// [KO] 코너 분류 인덱스를 로드합니다.
// [EN] Loads corner category index data.
async function loadCategoryIndex() {
  return dataController.loadCategoryIndex();
}

// [KO] 현재 사용 가능한 코너 항목 목록을 반환합니다.
// [EN] Returns currently available corner entries.
function getCategoryEntries() {
  return dataController.getCategoryEntries();
}

// [KO] 코너 이름으로 분류 항목을 조회합니다.
// [EN] Finds category entry by corner name.
function findCategoryEntryByName(categoryName) {
  return dataController.findCategoryEntryByName(categoryName);
}

// [KO] 코너 이름으로 연결된 기사 데이터를 불러옵니다.
// [EN] Loads category-linked articles by corner name.
async function loadCategoryArticlesByName(categoryName) {
  return dataController.loadCategoryArticlesByName(categoryName);
}

// [KO] 현재 선택 코너의 데이터가 로드되었는지 보장합니다.
// [EN] Ensures data for selected corner is loaded.
async function ensureSelectedCornerLoaded() {
  return dataController.ensureSelectedCornerLoaded();
}

// [KO] 전체 코너 카테고리 목록을 반환합니다.
// [EN] Returns full list of corner categories.
function getCornerCategories() {
  return dataController.getCornerCategories();
}

// [KO] 현재 필터 기준으로 보이는 코너 목록을 반환합니다.
// [EN] Returns corner categories visible under current filter.
function getVisibleCornerCategories() {
  return dataController.getVisibleCornerCategories();
}

// [KO] 주어진 코너를 기본 확장할지 여부를 계산합니다.
// [EN] Determines whether a given corner should be expanded by default.
function shouldExpandCorner(category) {
  return dataController.shouldExpandCorner(category);
}

// [KO] 코너 모드의 기본 선택 코너를 반환합니다.
// [EN] Returns default selected corner for corner mode.
function getDefaultCorner() {
  return dataController.getDefaultCorner();
}

// [KO] 코너 리스트 UI를 렌더링합니다.
// [EN] Renders the corner list UI.
function renderCornerList() {
  return viewController.renderCornerList();
}

// [KO] 코너 내부 기사 목록을 인라인으로 렌더링합니다.
// [EN] Renders inline article items within a corner block.
function renderCornerInlineArticles(cat, container) {
  return viewController.renderCornerInlineArticles(cat, container);
}

// [KO] 유효한 PDF 링크인지 검사합니다.
// [EN] Checks whether the given URL is a usable PDF link.
function hasUsablePdfUrl(url) {
  return viewController.hasUsablePdfUrl(url);
}

// [KO] 상단 히어로 메타 정보를 갱신합니다.
// [EN] Updates top hero metadata display.
function updateHero() {
  return viewController.updateHero();
}

// [KO] 호수 네비게이션 목록과 선택 상태를 렌더링합니다.
// [EN] Renders issue navigation list and selected state.
function renderIssueNav() {
  return viewController.renderIssueNav();
}

// [KO] 기사 카테고리 선택 옵션을 렌더링합니다.
// [EN] Renders article category filter options.
function renderCategoryOptions() {
  return viewController.renderCategoryOptions();
}

// [KO] 코너 필터 선택 옵션을 렌더링합니다.
// [EN] Renders corner filter options.
function renderCornerFilterOptions() {
  return viewController.renderCornerFilterOptions();
}

// [KO] 현재 호수의 PDF 링크 영역을 갱신합니다.
// [EN] Refreshes PDF link area for current issue.
function renderIssuePdfLink() {
  return viewController.renderIssuePdfLink();
}

// [KO] 현재 조건에 맞는 기사 목록을 렌더링합니다.
// [EN] Renders article list for current filters and mode.
function renderArticleList() {
  return viewController.renderArticleList();
}

// [KO] ID로 기사 객체를 찾아 반환합니다.
// [EN] Finds and returns an article object by ID.
function findArticleById(id) {
  return viewController.findArticleById(id);
}

// [KO] 선택된 기사 본문 상세 화면을 렌더링합니다.
// [EN] Renders detailed view for selected article.
function renderArticleDetail() {
  return viewController.renderArticleDetail();
}

// [KO] 현재 선택된 호수 정보를 반환합니다.
// [EN] Returns currently selected issue information.
function currentIssue() {
  return dataController.currentIssue();
}

// [KO] 현재 호수 기준으로 필터링된 기사 목록을 반환합니다.
// [EN] Returns filtered articles scoped to current issue.
function filteredArticlesForIssue() {
  return dataController.filteredArticlesForIssue();
}

// [KO] 현재 화면 조건 전체를 반영한 기사 목록을 반환합니다.
// [EN] Returns articles filtered by current view and conditions.
function filteredArticles() {
  return dataController.filteredArticles();
}

// [KO] HTML 텍스트를 안전하게 이스케이프합니다.
// [EN] Escapes text for safe HTML rendering.
function escapeHtml(value) {
  return viewController.escapeHtml(value);
}

// [KO] 속성 값에 사용할 텍스트를 안전하게 이스케이프합니다.
// [EN] Escapes text for safe HTML attribute usage.
function escapeAttribute(value) {
  return viewController.escapeAttribute(value);
}