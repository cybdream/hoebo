// KO: 화면 렌더링과 레이아웃 보조 동작을 묶어 관리합니다.
// EN: Manage screen rendering and layout helper behavior in one place.
export function createViewController(deps) {
  const {
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
  } = deps;

  // KO: 호수별 상단 네비게이션 표시 여부를 갱신합니다.
  // EN: Update visibility for the issue navigation bar.
  function updateIssueNavVisibility() {
    const show = state.viewMode === "issue";
    el.issueNav.hidden = !show;
    el.issueNav.style.display = show ? "flex" : "none";
  }

  // KO: 모바일 호수/코너 패널의 열림 상태를 반영합니다.
  // EN: Reflect the open state of the mobile issue/corner panel.
  function setMobileIssuePanelOpenInternal(isOpen) {
    state.isMobileIssuePanelOpen = isOpen;
    el.issuePanel.classList.toggle("is-open", isOpen);
    document.body.classList.toggle("issue-panel-open", isOpen);
    el.mobileIssuePanelToggle.setAttribute("aria-expanded", String(isOpen));
    el.mobileIssuePanelToggle.textContent = isOpen ? "호수/코너 목록 닫기" : "호수/코너 목록 열기";
  }

  // KO: 모바일에서 본문으로 자연스럽게 이동시킵니다.
  // EN: Move the reader panel into view on mobile.
  function scrollReaderIntoViewIfMobileInternal() {
    if (window.innerWidth > 1100) {
      return;
    }

    // 모바일에서 기사 선택 시 목록 오버레이를 먼저 닫아 본문을 바로 볼 수 있게 한다.
    if (state.isMobileIssuePanelOpen) {
      setMobileIssuePanelOpenInternal(false);
    }

    requestAnimationFrame(() => {
      el.readerPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  // KO: 현재 본문 스크롤 위치를 계산합니다.
  // EN: Measure the current article scroll position.
  function articleScrollTop() {
    if (window.innerWidth <= 1100) {
      return window.scrollY || document.documentElement.scrollTop || 0;
    }

    return el.articleBody?.scrollTop || 0;
  }

  // KO: 목록 쪽 스크롤 위치를 계산합니다.
  // EN: Measure the article list scroll position.
  function articleListScrollTop() {
    if (window.innerWidth <= 1100) {
      if (state.isMobileIssuePanelOpen) {
        return el.issuePanel?.scrollTop || 0;
      }
      return window.scrollY || document.documentElement.scrollTop || 0;
    }

    return el.articleList?.scrollTop || 0;
  }

  // KO: 빠른 이동 버튼의 노출 여부를 갱신합니다.
  // EN: Update the visibility of quick navigation buttons.
  function updateQuickNavVisibilityInternal() {
    const hasArticle = !el.articleView.classList.contains("is-hidden");
    const shouldShow = articleScrollTop() > 220 || articleListScrollTop() > 220 || (hasArticle && articleScrollTop() > 120);
    if (el.quickNav) {
      el.quickNav.hidden = !shouldShow;
    }
  }

  // KO: 기사 목록을 맨 위로 부드럽게 이동합니다.
  // EN: Smoothly scroll the article list to the top.
  function scrollArticleListTop() {
    if (window.innerWidth <= 1100) {
      if (state.isMobileIssuePanelOpen) {
        el.issuePanel?.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      el.articleList?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    el.articleList?.scrollTo({ top: 0, behavior: "smooth" });
  }

  // KO: 본문을 맨 위로 부드럽게 이동합니다.
  // EN: Smoothly scroll the article body to the top.
  function scrollArticleTop() {
    if (window.innerWidth <= 1100) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    el.articleBody?.scrollTo({ top: 0, behavior: "smooth" });
  }

  // KO: 상단 메뉴 쪽으로 돌아갑니다.
  // EN: Scroll back to the top menu area.
  function scrollToTopMenu() {
    el.tabIssue?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (window.innerWidth > 1100) {
      el.articleBody?.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  // KO: 본문이 바뀔 때 읽기 위치를 상단으로 초기화합니다.
  // EN: Reset reading position when the article changes.
  function resetArticleScrollPositionInternal() {
    if (window.innerWidth <= 1100) {
      el.readerPanel?.scrollIntoView({ behavior: "auto", block: "start" });
      return;
    }

    el.articleBody?.scrollTo({ top: 0, behavior: "auto" });
  }

  // KO: 헤더 영역에 호수/기사 요약을 표시합니다.
  // EN: Render the summary shown in the hero area.
  function updateHero() {
    const issueCount = state.issues.length;
    const totalArticles = state.issues.reduce((sum, i) => sum + (i.articleCount || 0), 0);
    const generatedAt = state.payload?.generatedAt ? new Date(state.payload.generatedAt).toLocaleString("ko-KR") : "알 수 없음";
    el.heroMeta.textContent = `${issueCount}개 호, 총 ${totalArticles}개 기사 · 마지막 생성 ${generatedAt}`;
  }

  // KO: 호수 선택 박스와 이전/다음 이동을 표시합니다.
  // EN: Render the issue selector and previous/next navigation.
  function renderIssueNav() {
    el.issueSelect.innerHTML = state.issues
      .map((issue) => `<option value="${escapeAttribute(String(issue.webzineId))}"${String(issue.webzineId) === state.selectedIssueId ? " selected" : ""}>${escapeHtml(issue.issueLabel)} · ${escapeHtml(issue.dateLabel)}</option>`)
      .join("");

    const idx = state.issues.findIndex((i) => String(i.webzineId) === state.selectedIssueId);
    el.prevIssueBtn.disabled = idx >= state.issues.length - 1;
    el.nextIssueBtn.disabled = idx <= 0;

    const issue = currentIssue();
    if (issue?.coverUrl && state.viewMode === "issue") {
      el.issueCoverImg.src = issue.coverUrl;
      el.issueCoverImg.alt = `${issue.issueLabel} 표지`;
      el.issueCoverWrap.hidden = false;
    } else {
      el.issueCoverWrap.hidden = true;
    }
  }

  // KO: 기사 카테고리 선택 항목을 화면에 맞춰 렌더링합니다.
  // EN: Render category options according to the current view.
  function renderCategoryOptions() {
    el.categoryField.hidden = state.viewMode === "corner";
    if (el.cornerFilterField) {
      el.cornerFilterField.hidden = state.viewMode !== "corner";
    }

    if (state.viewMode === "corner") {
      renderCornerFilterOptions();
      return;
    }

    const pinnedCorner = "도전님 훈시";
    const rawCategories = [...new Set(filteredArticlesForIssue().map((article) => article.category).filter(Boolean))];
    const sortedCategories = rawCategories
      .filter((category) => category !== pinnedCorner)
      .sort((left, right) => left.localeCompare(right, "ko"));
    const categories = rawCategories.includes(pinnedCorner)
      ? [pinnedCorner, ...sortedCategories]
      : sortedCategories;
    const nextValue = categories.includes(state.selectedCategory) || state.selectedCategory === "all" ? state.selectedCategory : "all";
    state.selectedCategory = nextValue;
    const pinnedOption = rawCategories.includes(pinnedCorner)
      ? `<option value="${escapeAttribute(pinnedCorner)}">${escapeHtml(pinnedCorner)}</option>`
      : "";
    const otherOptions = sortedCategories
      .map((category) => `<option value="${escapeAttribute(category)}">${escapeHtml(category)}</option>`)
      .join("");
    el.categorySelect.innerHTML = `${pinnedOption}<option value="all">전체</option>${otherOptions}`;
    el.categorySelect.value = state.selectedCategory;
  }

  // KO: 코너 모드에서 사용할 필터 옵션을 렌더링합니다.
  // EN: Render the filter options used in corner mode.
  function renderCornerFilterOptions() {
    if (!el.cornerFilterSelect) {
      return;
    }

    const pinnedCorner = "도전님 훈시";
    const filterOptions = getCornerCategories().filter((category) => category !== pinnedCorner);
    const nextValue = filterOptions.includes(state.cornerFilter) ? state.cornerFilter : "all";
    state.cornerFilter = nextValue;
    el.cornerFilterSelect.innerHTML = `<option value="all">전체 코너</option>${filterOptions.map((category) => `<option value="${escapeAttribute(category)}">${escapeHtml(category)}</option>`).join("")}`;
    el.cornerFilterSelect.value = state.cornerFilter;
  }

  // KO: 현재 호수의 PDF 링크 상태를 표시합니다.
  // EN: Render the PDF link state for the current issue.
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

  // KO: 코너 아코디언 목록을 렌더링합니다.
  // EN: Render the corner accordion list.
  function renderCornerList() {
    el.cornerList.innerHTML = "";
    if (state.isLoadingCorner) {
      el.cornerList.innerHTML = `<div class="empty-state small">코너 목록을 불러오는 중입니다...</div>`;
      return;
    }

    const categories = getVisibleCornerCategories();

    if (categories.length === 0) {
      el.cornerList.innerHTML = `<div class="empty-state small">조건에 맞는 코너가 없습니다.<br>필터를 바꿔주세요.</div>`;
      return;
    }

    categories.forEach((cat) => {
      const item = document.createElement("div");
      item.className = "corner-item";

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `corner-card${state.selectedCorner === cat ? " is-active" : ""}`;
      btn.textContent = cat;
      btn.addEventListener("click", () => {
        state.selectedCorner = cat;
        state.selectedArticleId = null;
        renderCornerList();
        renderArticleDetail();
        ensureSelectedCornerLoaded().then(() => {
          renderCornerList();
          renderArticleDetail();
        });
        if (window.innerWidth <= 1100) {
          setMobileIssuePanelOpenInternal(false);
        }
      });
      item.appendChild(btn);

      if (shouldExpandCorner(cat)) {
        const inlineList = document.createElement("div");
        inlineList.className = "corner-inline-articles";
        renderCornerInlineArticles(cat, inlineList);
        item.appendChild(inlineList);
      }

      el.cornerList.appendChild(item);
    });
  }

  // KO: 코너별 기사 미리보기 행을 렌더링합니다.
  // EN: Render article preview rows inside a corner section.
  function renderCornerInlineArticles(cat, container) {
    const PREVIEW_COUNT = 4;
    const list = state.loadedCategoryArticles.get(cat);

    if (!list) {
      container.innerHTML = `<div class="empty-state small">목록을 불러오는 중입니다...</div>`;
      return;
    }

    if (list.length === 0) {
      container.innerHTML = `<div class="empty-state small">해당 코너 기사가 없습니다.</div>`;
      return;
    }

    // KO: 목록 행 생성 헬퍼입니다.
    // EN: Helper for building one preview row.
    function makeRow(article) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = `corner-article-row${state.selectedArticleId === article.id ? " is-active" : ""}`;
      row.innerHTML = `
      <span class="corner-issue">${escapeHtml(article.issueLabel)}</span>
      <span class="corner-title">${escapeHtml(article.title)}</span>
    `;
      row.addEventListener("click", async () => {
        if (article.webzineId) {
          await loadIssueData(String(article.webzineId));
        }
        state.selectedArticleId = article.id;
        renderCornerList();
        renderArticleDetail();
        scrollReaderIntoViewIfMobileInternal();
      });
      return row;
    }

    const preview = list.slice(0, PREVIEW_COUNT);
    preview.forEach((a) => container.appendChild(makeRow(a)));

    const rest = list.slice(PREVIEW_COUNT);
    if (rest.length > 0) {
      const moreWrap = document.createElement("div");
      moreWrap.hidden = true;
      rest.forEach((a) => moreWrap.appendChild(makeRow(a)));
      container.appendChild(moreWrap);

      const moreBtn = document.createElement("button");
      moreBtn.type = "button";
      moreBtn.className = "corner-more-btn";
      moreBtn.textContent = `+ 더 보기 (${rest.length}개)`;
      moreBtn.addEventListener("click", () => {
        moreWrap.hidden = false;
        moreBtn.remove();
      });
      container.appendChild(moreBtn);
    }
  }

  // KO: 유효한 PDF 주소인지 검사합니다.
  // EN: Check whether the PDF URL is usable.
  function hasUsablePdfUrl(url) {
    if (!url) {
      return false;
    }

    if (/^https:\/\/file\.daesoon\.org\/webzine\/pdf\/hoebo\d+\.pdf$/i.test(url)) {
      return false;
    }

    return true;
  }

  // KO: 기사 목록과 본문 상세 영역을 렌더링합니다.
  // EN: Render the article list and detail view.
  function renderArticleList() {
    if (state.viewMode === "corner") {
      renderArticleDetail();
      return;
    }

    el.articleList.innerHTML = "";
    el.articleList.classList.remove("corner-article-list");

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

    if (state.viewMode === "corner" && !state.selectedCorner) {
      el.resultMeta.textContent = "";
      el.articleList.innerHTML = `<div class="empty-state">← 좌측에서 코너를 선택하면<br>호수별 제목이 표시됩니다.</div>`;
      state.selectedArticleId = null;
      renderArticleDetail();
      return;
    }

    const list = filteredArticles();
    el.resultMeta.textContent = state.viewMode === "corner" ? "" : `${list.length}개 기사`;

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

    if (state.viewMode === "corner") {
      el.articleList.classList.add("corner-article-list");

      const header = document.createElement("div");
      header.className = "corner-article-head";
      header.innerHTML = `
      <strong>${escapeHtml(state.selectedCorner)} <span>(${list.length})</span></strong>
      <button type="button" class="corner-head-action">전체목록 보기</button>
    `;

      const clearBtn = header.querySelector(".corner-head-action");
      clearBtn?.addEventListener("click", () => {
        state.selectedCorner = getDefaultCorner();
        state.selectedArticleId = null;
        renderCornerList();
        renderArticleList();
        renderArticleDetail();
      });

      el.articleList.appendChild(header);
    }

    list.forEach((article) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = state.viewMode === "corner"
        ? `corner-article-row${state.selectedArticleId === article.id ? " is-active" : ""}`
        : `article-card${state.selectedArticleId === article.id ? " is-active" : ""}`;
      if (state.viewMode === "corner") {
        card.innerHTML = `
        <span class="corner-issue">${escapeHtml(article.issueLabel)}</span>
        <span class="corner-title">${escapeHtml(article.title)}</span>
      `;
      } else {
        card.innerHTML = `
        <div class="article-meta">${escapeHtml(article.issueLabel)} · ${escapeHtml(article.category || "미분류")}</div>
        <strong>${escapeHtml(article.title)}</strong>
        <div class="article-author">${escapeHtml(article.author || "필자 정보 없음")}</div>
        <p class="article-summary">${escapeHtml(article.summary)}</p>
      `;
      }
      card.addEventListener("click", () => {
        state.selectedArticleId = article.id;
        renderArticleList();
        renderArticleDetail();
        scrollReaderIntoViewIfMobileInternal();
      });
      el.articleList.appendChild(card);
    });

    renderArticleDetail();
    updateQuickNavVisibilityInternal();
  }

  // KO: 선택된 기사 ID로 상세 기사를 찾습니다.
  // EN: Find the article matching the selected article id.
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

  // KO: 본문 상세 뷰를 렌더링합니다.
  // EN: Render the article detail view.
  function renderArticleDetail() {
    const article = findArticleById(state.selectedArticleId);
    if (!article) {
      el.articleEmpty.classList.remove("is-hidden");
      el.articleView.classList.add("is-hidden");
      state.lastRenderedArticleId = null;
      updateQuickNavVisibilityInternal();
      return;
    }

    const isArticleChanged = state.lastRenderedArticleId !== article.id;

    el.articleEmpty.classList.add("is-hidden");
    el.articleView.classList.remove("is-hidden");
    el.articleIssue.textContent = `${article.issueLabel} · ${article.issueDateLabel}`;
    el.articleCategory.textContent = article.category || "미분류";
    el.articleTitle.textContent = article.title;
    el.articleAuthor.textContent = article.author || "필자 정보 없음";
    el.articleSourceLink.href = article.sourceUrl;
    el.articleBody.innerHTML = article.bodyHtml || `<p>${escapeHtml(article.bodyText || "본문이 없습니다.")}</p>`;

    const articleImages = el.articleBody.querySelectorAll("img");
    articleImages.forEach((img) => {
      img.setAttribute("loading", "lazy");
      img.setAttribute("decoding", "async");
    });

    if (isArticleChanged) {
      resetArticleScrollPositionInternal();
    }

    state.lastRenderedArticleId = article.id;
    updateQuickNavVisibilityInternal();
  }

  return {
    updateIssueNavVisibility,
    setMobileIssuePanelOpen: setMobileIssuePanelOpenInternal,
    scrollReaderIntoViewIfMobile: scrollReaderIntoViewIfMobileInternal,
    articleScrollTop,
    articleListScrollTop,
    updateQuickNavVisibility: updateQuickNavVisibilityInternal,
    scrollArticleListTop,
    scrollArticleTop,
    scrollToTopMenu,
    resetArticleScrollPosition: resetArticleScrollPositionInternal,
    updateHero,
    renderIssueNav,
    renderCategoryOptions,
    renderCornerFilterOptions,
    renderIssuePdfLink,
    renderCornerList,
    renderCornerInlineArticles,
    hasUsablePdfUrl,
    renderArticleList,
    findArticleById,
    renderArticleDetail,
    escapeHtml,
    escapeAttribute
  };
}