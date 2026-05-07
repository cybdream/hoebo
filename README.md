# 대순회보 뷰어

대순진리회 웹진 대순회보를 로컬 JSON 데이터셋으로 수집해 호수별 목록과 기사 본문을 볼 수 있는 정적 뷰어입니다.

## 실행

1. 프로젝트 폴더로 이동
2. 데이터 생성

```bash
cd d:\99_Projects\hoebo
npm run build:data
```

3. 정적 서버 실행

```bash
python -m http.server 5600
```

4. 브라우저에서 접속

- http://localhost:5600

## 스크립트

- `npm run build:data`: 최신 1개 호수 수집
- `npm run build:data:latest3`: 최신 3개 호수 수집
- `npm run verify:data`: 최신 1개 호수 기준 수집 검증만 수행

## 데이터 형식

`data/articles.json`

```json
{
  "version": "20260504.1015",
  "generatedAt": "2026-05-04T01:15:00.000Z",
  "source": "https://webzine.daesoon.org",
  "issues": [
    {
      "webzineId": 348,
      "issueNumber": 304,
      "issueNumberText": "304호",
      "label": "대순156년(2026) 4월",
      "coverUrl": "https://file.daesoon.org/webzine/cover/heoho304_cover.jpg",
      "articles": []
    }
  ]
}
```# 대순회보 뷰어

대순진리회 웹진의 회보 목록과 본문을 로컬 JSON으로 수집한 뒤 정적 페이지에서 탐색할 수 있도록 만든 프로토타입입니다.

## 실행

1. 데이터 생성

```bash
cd d:\99_Projects\hoebo
npm run build:data
```

2. 정적 서버 실행

```bash
cd d:\99_Projects\hoebo
python -m http.server 5600
```

3. 브라우저에서 열기

- http://localhost:5600

## 포함 기능

- 대순회보 최신 호 수집 스크립트
- 호수별 목록 탐색
- 제목, 필자, 본문 검색
- 카테고리 필터
- 원문 링크 열기

## 데이터 수집 옵션

# 대순회보 뷰어

대순진리회 웹진 대순회보를 로컬 JSON 데이터셋으로 수집해 호수별 목록과 기사 본문을 볼 수 있는 정적 뷰어입니다.

## 실행

1. 데이터 생성

```bash
cd d:\99_Projects\hoebo
npm run build:data
```

2. 정적 서버 실행

```bash
cd d:\99_Projects\hoebo
python -m http.server 5600
```

3. 브라우저에서 접속

- http://localhost:5600

## 스크립트

- `npm run build:data`: 최신 1개 호수 수집
- `npm run build:data:latest3`: 최신 3개 호수 수집
- `npm run build:categories`: 현재 `data/issues` 기반 카테고리 묶음 데이터 생성
- `npm run verify:data`: 최신 1개 호수 수집 검증만 수행

## 카테고리 데이터

`npm run build:categories` 실행 시 아래 파일이 생성됩니다.

- `data/categories/index.json`: 카테고리 인덱스
- `data/categories/items/*.json`: 카테고리별 기사 목록

## 데이터 형식

`data/articles.json`

```json
{
  "version": "20260504.1015",
  "generatedAt": "2026-05-04T01:15:00.000Z",
  "source": "https://webzine.daesoon.org/",
  "issues": [
    {
      "webzineId": 348,
      "issueNo": 304,
      "issueLabel": "304호",
      "dateLabel": "대순156년(2026) 4월",
      "coverUrl": "https://file.daesoon.org/webzine/cover/heoho304_cover.jpg",
      "articles": []
    }
  ]
}
```