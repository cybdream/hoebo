const DATA_URL = "data/articles.json";

const state = {
  payload: null,
  issues: [],
  articles: [],
  selectedIssueId: "all",
  selectedCategory: "all",
  selectedArticleId: null,
  query: ""
};

const el = {
  heroMeta: document.querySelector("#heroMeta"),
  issueStats: document.querySelector("#issueStats"),
  resultMeta: document.querySelector("#resultMeta"),
  issueList: document.querySelector("#issueList"),
  articleList: document.querySelector("#articleList"),
  articleEmpty: document.querySelector("#articleEmpty"),
  articleView: document.querySelector("#articleView"),
  articleIssue: document.querySelector("#articleIssue"),
  articleCategory: document.querySelector("#articleCategory"),
  articleTitle: document.querySelector("#articleTitle"),
  articleAuthor: document.querySelector("#articleAuthor"),
  articleBody: document.querySelector("#articleBody"),
  articleSourceLink: document.querySelector("#articleSourceLink"),
  searchInput: document.querySelector("#searchInput"),
  categorySelect: document.querySelector("#categorySelect")
};

boot();

async function boot() {
  bindEvents();
  await loadData();
  render();
}

function bindEvents() {
  el.searchInput.addEventListener("input", () => {
    state.query = el.searchInput.value.trim().toLowerCase();
    renderArticleList();
  });

  el.categorySelect.addEventListener("change", () => {
    state.selectedCategory = el.categorySelect.value;
    renderArticleList();
  });
}

async function loadData() {
  const response = await fetch(`${DATA_URL}?t=${Date.now()}`);
  state.payload = await response.json();
  state.issues = Array.isArray(state.payload.issues) ? state.payload.issues : [];
  state.articles = state.issues.flatMap((issue) =>
    issue.articles.map((article) => ({
      ...article,
      issueId: String(issue.webzineId),
      issueNo: issue.issueNo,
      issueLabel: issue.issueLabel,
      issueDateLabel: issue.dateLabel,
      coverUrl: issue.coverUrl,
      searchBlob: `${article.title} ${article.author} ${article.category} ${article.bodyText}`.toLowerCase()
    }))
  );

  state.issues.sort((left, right) => right.issueNo - left.issueNo);
  state.articles.sort((left, right) => {
    if (right.issueNo !== left.issueNo) return right.issueNo - left.issueNo;
    return left.order - right.order;
  });

  if (state.issues[0]) {
    state.selectedIssueId = String(state.issues[0].webzineId);
  }

  if (state.articles[0]) {
    state.selectedArticleId = state.articles[0].id;
  }
}

function render() {
  updateHero();
  renderIssueList();
  renderCategoryOptions();
  renderArticleList();
  renderArticleDetail();
}

function updateHero() {
  const issueCount = state.issues.length;
  const articleCount = state.articles.length;
  const generatedAt = state.payload?.generatedAt ? new Date(state.payload.generatedAt).toLocaleString("ko-KR") : "알 수 없음";
  el.heroMeta.textContent = `${issueCount}개 호, ${articleCount}개 기사 로컬 적재 · 마지막 생성 ${generatedAt}`;
  el.issueStats.textContent = `${issueCount}개 호`;
}

function renderIssueList() {
  el.issueList.innerHTML = "";

  const allButton = document.createElement("button");
  allButton.type = "button";
  allButton.className = `issue-card${state.selectedIssueId === "all" ? " is-active" : ""}`;
  allButton.innerHTML = `
    <strong>전체 호수</strong>
    <span class="muted">모든 회보 기사 통합 보기</span>
  `;
  allButton.addEventListener("click", () => {
    state.selectedIssueId = "all";
    renderIssueList();
    renderCategoryOptions();
    renderArticleList();
  });
  el.issueList.appendChild(allButton);

  state.issues.forEach((issue) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = `issue-card${state.selectedIssueId === String(issue.webzineId) ? " is-active" : ""}`;
    card.innerHTML = `
      <strong>${escapeHtml(issue.issueLabel)}</strong>
      <span class="muted">${escapeHtml(issue.dateLabel)} · ${issue.articles.length}개 기사</span>
      ${issue.coverUrl ? `<img src="${escapeAttribute(issue.coverUrl)}" alt="${escapeAttribute(issue.issueLabel)} 표지" loading="lazy" />` : ""}
    `;
    card.addEventListener("click", () => {
      state.selectedIssueId = String(issue.webzineId);
      renderIssueList();
      renderCategoryOptions();
      renderArticleList();
    });
    el.issueList.appendChild(card);
  });
}

function renderCategoryOptions() {
  const categories = [...new Set(filteredArticlesForIssue().map((article) => article.category).filter(Boolean))].sort((left, right) => left.localeCompare(right, "ko"));
  const nextValue = categories.includes(state.selectedCategory) ? state.selectedCategory : "all";
  state.selectedCategory = nextValue;
  el.categorySelect.innerHTML = `<option value="all">전체</option>${categories.map((category) => `<option value="${escapeAttribute(category)}">${escapeHtml(category)}</option>`).join("")}`;
  el.categorySelect.value = state.selectedCategory;
}

function renderArticleList() {
  const list = filteredArticles();
  el.articleList.innerHTML = "";
  el.resultMeta.textContent = `${list.length}개 기사`;

  if (list.length === 0) {
    el.articleList.innerHTML = `<div class="empty-state">조건에 맞는 기사가 없습니다.</div>`;
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
    });
    el.articleList.appendChild(card);
  });

  renderArticleDetail();
}

function renderArticleDetail() {
  const article = state.articles.find((item) => item.id === state.selectedArticleId);
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

function filteredArticlesForIssue() {
  if (state.selectedIssueId === "all") {
    return state.articles;
  }
  return state.articles.filter((article) => article.issueId === state.selectedIssueId);
}

function filteredArticles() {
  return filteredArticlesForIssue().filter((article) => {
    if (state.selectedCategory !== "all" && article.category !== state.selectedCategory) {
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