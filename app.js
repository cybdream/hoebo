const INDEX_URL = "data/index.json";

const state = {
  payload: null,
  issues: [],
  articles: [],
  loadedIssues: new Map(),
  isLoadingIssue: false,
  selectedIssueId: "all",
  selectedCategory: "all",
  selectedArticleId: null,
  viewMode: "issue",
  selectedCorner: "all",
  query: "",
  isMobileIssuePanelOpen: false
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
  tabIssue: document.querySelector("#tabIssue"),
  tabCorner: document.querySelector("#tabCorner"),
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
  issueCoverToggle: document.querySelector("#issueCoverToggle")
};

boot();

async function boot() {
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
}

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

  el.tabIssue.addEventListener("click", () => switchViewMode("issue"));
  el.tabCorner.addEventListener("click", () => switchViewMode("corner"));

  window.addEventListener("resize", () => {
    if (window.innerWidth > 1100 && state.isMobileIssuePanelOpen) {
      setMobileIssuePanelOpen(false);
    }
  });
}

function setMobileIssuePanelOpen(isOpen) {
  state.isMobileIssuePanelOpen = isOpen;
  el.issuePanel.classList.toggle("is-open", isOpen);
  document.body.classList.toggle("issue-panel-open", isOpen);
  el.mobileIssuePanelToggle.setAttribute("aria-expanded", String(isOpen));
  el.mobileIssuePanelToggle.textContent = isOpen ? "호수/코너 목록 닫기" : "호수/코너 목록 열기";
}

function scrollReaderIntoViewIfMobile() {
  if (window.innerWidth > 1100) {
    return;
  }

  requestAnimationFrame(() => {
    el.readerPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

async function loadData() {
  try {
    const response = await fetch(`${INDEX_URL}?t=${Date.now()}`);
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

async function switchIssue(webzineId) {
  const key = String(webzineId);
  state.selectedIssueId = key;
  state.isLoadingIssue = true;
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

function switchViewMode(mode) {
  if (state.viewMode === mode) return;
  state.viewMode = mode;
  state.selectedCorner = "all";
  state.selectedArticleId = null;
  el.tabIssue.classList.toggle("is-active", mode === "issue");
  el.tabCorner.classList.toggle("is-active", mode === "corner");
  el.issueNav.hidden = mode === "corner";
  el.issueCoverWrap.hidden = mode === "corner" || !currentIssue()?.coverUrl;
  el.cornerList.hidden = mode === "issue";
  if (mode === "corner") {
    renderCornerList();
    renderCategoryOptions();
    renderArticleList();
    renderArticleDetail();
  } else {
    renderIssueNav();
    renderCategoryOptions();
    renderIssuePdfLink();
    renderArticleList();
    renderArticleDetail();
  }
}

function allLoadedArticles() {
  const all = [];
  for (const articles of state.loadedIssues.values()) {
    all.push(...articles);
  }
  return all.sort((a, b) => b.issueNo !== a.issueNo ? b.issueNo - a.issueNo : a.order - b.order);
}

function renderCornerList() {
  el.cornerList.innerHTML = "";
  const pinnedCorner = "도전님 훈시";
  const categories = [...new Set(allLoadedArticles().map((a) => a.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko"));
  const pinnedIndex = categories.indexOf(pinnedCorner);
  if (pinnedIndex > 0) {
    categories.splice(pinnedIndex, 1);
    categories.unshift(pinnedCorner);
  }

  if (categories.length === 0) {
    el.cornerList.innerHTML = `<div class="empty-state small">호수를 먼저 선택하면<br>코너 목록이 나타납니다.</div>`;
    return;
  }

  const allBtn = document.createElement("button");
  allBtn.type = "button";
  allBtn.className = `corner-card${state.selectedCorner === "all" ? " is-active" : ""}`;
  allBtn.textContent = "전체";
  allBtn.addEventListener("click", () => {
    state.selectedCorner = "all";
    renderCornerList();
    renderArticleList();
    if (window.innerWidth <= 1100) {
      setMobileIssuePanelOpen(false);
    }
  });
  el.cornerList.appendChild(allBtn);

  categories.forEach((cat) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `corner-card${state.selectedCorner === cat ? " is-active" : ""}`;
    btn.textContent = cat;
    btn.addEventListener("click", () => {
      state.selectedCorner = cat;
      renderCornerList();
      renderArticleList();
      if (window.innerWidth <= 1100) {
        setMobileIssuePanelOpen(false);
      }
    });
    el.cornerList.appendChild(btn);
  });
}

function hasUsablePdfUrl(url) {
  if (!url) {
    return false;
  }

  // Current scraped file.daesoon PDF URLs consistently return 404.
  if (/^https:\/\/file\.daesoon\.org\/webzine\/pdf\/hoebo\d+\.pdf$/i.test(url)) {
    return false;
  }

  return true;
}

function updateHero() {
  const issueCount = state.issues.length;
  const totalArticles = state.issues.reduce((sum, i) => sum + (i.articleCount || 0), 0);
  const generatedAt = state.payload?.generatedAt ? new Date(state.payload.generatedAt).toLocaleString("ko-KR") : "알 수 없음";
  el.heroMeta.textContent = `${issueCount}개 호, 총 ${totalArticles}개 기사 · 마지막 생성 ${generatedAt}`;
}

function renderIssueNav() {
  // select 옵션 채우기
  el.issueSelect.innerHTML = state.issues
    .map((issue) => `<option value="${escapeAttribute(String(issue.webzineId))}"${String(issue.webzineId) === state.selectedIssueId ? " selected" : ""}>${escapeHtml(issue.issueLabel)} · ${escapeHtml(issue.dateLabel)}</option>`)
    .join("");

  // 이전/다음 버튼 활성화 (issues는 최신순 정렬: [최신, ..., 오래된])
  const idx = state.issues.findIndex((i) => String(i.webzineId) === state.selectedIssueId);
  el.prevIssueBtn.disabled = idx >= state.issues.length - 1; // 가장 오래된 호
  el.nextIssueBtn.disabled = idx <= 0;                       // 가장 최신 호

  // 표지 이미지
  const issue = currentIssue();
  if (issue?.coverUrl && state.viewMode === "issue") {
    el.issueCoverImg.src = issue.coverUrl;
    el.issueCoverImg.alt = `${issue.issueLabel} 표지`;
    el.issueCoverWrap.hidden = false;
  } else {
    el.issueCoverWrap.hidden = true;
  }
}

function renderCategoryOptions() {
  el.categoryField.hidden = state.viewMode === "corner";
  if (state.viewMode === "corner") return;
  const categories = [...new Set(filteredArticlesForIssue().map((article) => article.category).filter(Boolean))].sort((left, right) => left.localeCompare(right, "ko"));
  const nextValue = categories.includes(state.selectedCategory) ? state.selectedCategory : "all";
  state.selectedCategory = nextValue;
  el.categorySelect.innerHTML = `<option value="all">전체</option>${categories.map((category) => `<option value="${escapeAttribute(category)}">${escapeHtml(category)}</option>`).join("")}`;
  el.categorySelect.value = state.selectedCategory;
}

function renderIssuePdfLink() {
  const issue = currentIssue();

  if (state.selectedIssueId === "all" || state.viewMode === "corner") {
    el.issuePdfLink.hidden = true;
    el.issuePdfLink.removeAttribute("href");
    return;
  }

  el.issuePdfLink.hidden = false;
  if (hasUsablePdfUrl(issue?.pdfUrl)) {
    el.issuePdfLink.href = issue.pdfUrl;
    el.issuePdfLink.textContent = "PDF 다운로드";
    el.issuePdfLink.classList.remove("is-disabled");
  } else {
    el.issuePdfLink.removeAttribute("href");
    el.issuePdfLink.textContent = "PDF 없음";
    el.issuePdfLink.classList.add("is-disabled");
  }
}

function renderArticleList() {
  el.articleList.innerHTML = "";

  if (state.viewMode === "issue" && state.selectedIssueId === "all") {
    el.resultMeta.textContent = "";
    el.articleList.innerHTML = `<div class="empty-state">← 호수를 선택하면 기사를 불러옵니다.</div>`;
    renderArticleDetail();
    return;
  }

  if (state.viewMode === "issue" && state.isLoadingIssue) {
    el.resultMeta.textContent = "불러오는 중...";
    el.articleList.innerHTML = `<div class="empty-state">기사를 불러오는 중입니다...</div>`;
    return;
  }

  const list = filteredArticles();
  el.resultMeta.textContent = `${list.length}개 기사`;

  if (list.length === 0) {
    const msg = state.viewMode === "corner" ? "불러온 호수에 해당 코너 기사가 없습니다." : "조건에 맞는 기사가 없습니다.";
    el.articleList.innerHTML = `<div class="empty-state">${msg}</div>`;
    state.selectedArticleId = null;
    renderArticleDetail();
    return;
  }

  if (!list.some((article) => article.id === state.selectedArticleId)) {
    state.selectedArticleId = list[0].id;
  }

  list.forEach((article) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = `article-card${state.selectedArticleId === article.id ? " is-active" : ""}`;
    card.innerHTML = `
      <div class="article-meta">${escapeHtml(article.issueLabel)} · ${escapeHtml(article.category || "미분류")}</div>
      <strong>${escapeHtml(article.title)}</strong>
      <div class="article-author">${escapeHtml(article.author || "필자 정보 없음")}</div>
      <p class="article-summary">${escapeHtml(article.summary)}</p>
    `;
    card.addEventListener("click", () => {
      state.selectedArticleId = article.id;
      renderArticleList();
      renderArticleDetail();
      scrollReaderIntoViewIfMobile();
    });
    el.articleList.appendChild(card);
  });

  renderArticleDetail();
}

function findArticleById(id) {
  if (!id) return null;
  if (state.viewMode === "corner") {
    for (const articles of state.loadedIssues.values()) {
      const found = articles.find((a) => a.id === id);
      if (found) return found;
    }
    return null;
  }
  return state.articles.find((a) => a.id === id) || null;
}

function renderArticleDetail() {
  const article = findArticleById(state.selectedArticleId);
  if (!article) {
    el.articleEmpty.classList.remove("is-hidden");
    el.articleView.classList.add("is-hidden");
    return;
  }

  el.articleEmpty.classList.add("is-hidden");
  el.articleView.classList.remove("is-hidden");
  el.articleIssue.textContent = `${article.issueLabel} · ${article.issueDateLabel}`;
  el.articleCategory.textContent = article.category || "미분류";
  el.articleTitle.textContent = article.title;
  el.articleAuthor.textContent = article.author || "필자 정보 없음";
  el.articleSourceLink.href = article.sourceUrl;
  el.articleBody.innerHTML = article.bodyHtml || `<p>${escapeHtml(article.bodyText || "본문이 없습니다.")}</p>`;
}

function currentIssue() {
  if (state.selectedIssueId === "all") {
    return null;
  }

  return state.issues.find((issue) => String(issue.webzineId) === state.selectedIssueId) || null;
}

function filteredArticlesForIssue() {
  if (state.viewMode === "corner") {
    const all = allLoadedArticles();
    return state.selectedCorner === "all" ? all : all.filter((a) => a.category === state.selectedCorner);
  }
  return state.articles;
}

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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}