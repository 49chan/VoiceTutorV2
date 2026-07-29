# 작업 진행 상태 (Task List)

- [x] 1. 화면 테마 블랙/화이트 선택 기능 추가
  - [x] frontend/index.html에 테마 선택 dropdown 추가
  - [x] frontend/css/style.css에 라이트 테마 변수 (`body.theme-white`) 및 세부 스타일 오버라이드 추가
  - [x] frontend/js/app.js에 `applyScreenTheme` 함수 추가, 초기 구동 시 및 설정 저장 시 동기화 로직 구현
- [x] 2. [변환] 버튼 숨김 처리
  - [x] frontend/index.html의 `btn-func-extract` 요소에 `style="display: none;"` 추가
- [x] 3. 녹음 기능 개선 (평가 후 비활성화 및 타이머 위치 변경)
  - [x] frontend/index.html에서 `recording-timer-countdown` 요소를 헤더 영역의 녹음 상태 표시기 왼쪽으로 이동
  - [x] frontend/js/app.js의 `submitAssessment()` 성공 시 `btn-func-record` 비활성화 처리
- [x] 4. 평가 기능 개선 (평가 후 비활성화 및 피드백/점수판 레이아웃 상단 이동)
  - [x] frontend/js/app.js의 `submitAssessment()` 성공 시 `btn-func-evaluate` 비활성화 처리 (finally 구문 내 조건부 활성화 보완)
  - [x] frontend/index.html of `practice-bottom-row` 레이아웃을 `practice-top-row`로 변경 및 위치를 상단으로 이동
  - [x] frontend/css/style.css에서 `practice-bottom-row` 스타일을 `practice-top-row`에 맞게 변경 및 여백 조율
  - [x] frontend/js/app.js의 `toggleTextEditMode()`에서 편집 모드 탈출 시 `resetEvaluationDisplay()`를 호출하여 `btn-func-record` 재활성화 및 화면 리셋 구현
- [x] 5. JSON 파일 로드 시 추가 개선 및 스크롤 최적화
  - [x] JSON 로드 시 연필 버튼(편집 기능) 비활성화 및 다른 파일 로드/추출 시 활성화
  - [x] workspace 및 card 요소에 min-height: 0 적용하여 스크롤 활성화 및 하단 버튼 가림 해결
  - [x] 라이트 테마 시 점수 가독성 향상을 위해 그라데이션 시작 색상 변수화
