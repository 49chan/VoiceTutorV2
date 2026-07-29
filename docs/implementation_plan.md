# KCoach v2 UI & 기능 개선 구현 계획서 (Implementation Plan)

본 문서는 사용자의 요구사항에 맞게 테마 설정, 버튼 비활성화 로직, 타이머 위치 이동 및 평가 결과 영역의 레이아웃 조정을 위한 개발 계획을 담고 있습니다.

## 1. 개요 및 요구사항 분석

1. **설정 (Theme Settings)**:
   - 화면 테마를 **블랙(기본)** / **화이트**로 선택할 수 있도록 설정 창에 옵션을 추가합니다.
   - 테마 선택 시 화면의 전체적인 바탕색 및 텍스트 색상이 다이내믹하게 전환되도록 CSS 및 JS를 결합하여 처리합니다.
   - 사용자가 선택한 테마 설정은 `localStorage`에 영구 보존하여 페이지 리로드 시에도 유지되도록 설계합니다.

2. **변환 (Remove Convert Button)**:
   - 기존의 헤더 액션 바에 노출되던 [변환] 버튼(`btn-func-extract`)을 화면에서 보이지 않도록 숨깁니다 (또는 제거합니다).
   - "파일열기" 기능에서 PDF 파일 로드 시 자동으로 변환 드로어가 활성화되는 기존 동작은 그대로 유지합니다.

3. **녹음 (Record Button & Timer)**:
   - 평가가 완료(결과 표출)된 이후에는 오작동 방지를 위해 [녹음] 버튼을 비활성화(`disabled` 처리 및 비활성 스타일 적용)합니다.
   - 녹음 중 화면 우측 하단(카드 푸터)에 표시되던 2분 제한 타이머를 헤더 우측의 녹음 상태 표시 아이콘(빨간색 플레이 아이콘)의 왼쪽으로 이동시켜 시인성을 높입니다.

4. **평가 (Evaluate Button & Layout)**:
   - 평가가 성공적으로 완료되어 결과가 화면에 표시된 후에는 [평가] 버튼을 비활성화하여 불필요한 중복 평가 요청을 차단합니다.
   - 화면 하단에 격자(Grid) 구조로 분리되어 표시되던 종합 피드백 리포트와 점수판 영역을 낭독 카드 텍스트 영역의 **상단**으로 이동시킵니다.

---

## 2. 변경할 파일 상세

### Frontend

#### [MODIFY] [index.html](file:///d:/49chan/12.%20Antigravity/20260724_KCoach_v2/frontend/index.html)
1. **설정 드로어(`drawer-settings`) 내에 테마 선택 필드 추가**:
   - `setting-learning-lang` 상단 또는 하단에 화면 테마 선택 셀렉트 박스(`setting-screen-theme`)를 배치합니다.
2. **[변환] 버튼 감추기**:
   - `btn-func-extract`에 `style="display: none;"` 스타일을 삽입하여 화면에서 숨기되 JS 참조 에러가 나지 않도록 마크업을 유지합니다.
3. **타이머 위치 변경**:
   - 기존 `card-footer-info` 영역에 있던 `recording-timer-countdown` 요소를 헤더 영역의 `recording-status-indicator` 바로 왼쪽으로 이동시킵니다.
   - 원활한 정렬을 위해 두 요소를 새로운 flexbox wrapper(`header-right-indicator`)로 감쌉니다.
4. **피드백 리포트 및 점수판 레이아웃 상단 노출**:
   - 기존에 `.practice-workspace` 하단에 독립되어 있던 `<section class="practice-bottom-row">` 영역의 명칭을 `practice-top-row`로 변경하고, 이를 `practice-workspace`와 `practice-header` 사이로 순서를 변경(상단 배치)합니다.

#### [MODIFY] [style.css](file:///d:/49chan/12.%20Antigravity/20260724_KCoach_v2/frontend/css/style.css)
1. **White(화이트) 테마 변수 재정의**:
   - `body.theme-white` 클래스 선택자 아래에 라이트 테마용 CSS 변수를 재정의합니다:
     ```css
     body.theme-white {
         --bg-primary: #ffffff;
         --bg-secondary: #f3f4f6;
         --bg-card: rgba(243, 244, 246, 0.85);
         --text-main: #1f2937;
         --text-muted: #4b5563;
         --border-light: rgba(0, 0, 0, 0.08);
         background-image: 
             radial-gradient(at 0% 0%, rgba(99, 102, 241, 0.05) 0px, transparent 50%),
             radial-gradient(at 100% 100%, rgba(16, 185, 129, 0.03) 0px, transparent 50%);
     }
     ```
   - 화이트 테마 적용 시 드롭다운, 업로드 점선 영역(`.upload-dropzone`), 랜딩 페이지의 헤더 및 푸터 등의 다크 투명도를 보정하기 위해 필요한 테마별 스타일을 추가합니다.
2. **타이머 정렬 및 `practice-top-row` 스타일**:
   - `practice-bottom-row` 스타일을 `practice-top-row` 스타일로 수정 적용하여 마진과 패딩을 상단 레이아웃에 맞춰 보정합니다.

#### [MODIFY] [app.js](file:///d:/49chan/12.%20Antigravity/20260724_KCoach_v2/frontend/js/app.js)
1. **화면 테마 처리 로직 추가**:
   - `applyScreenTheme(theme)` 함수를 추가하여 테마 선택 상태에 따라 `body` 클래스 및 `localStorage` 값을 업데이트합니다.
   - `loadAppSettings` 및 `DOMContentLoaded` 실행 시 저장된 테마 정보를 복원하고 테마 셀렉트 박스의 값을 채우는 코드를 추가합니다.
   - `saveAppSettings` 호출 시 선택된 테마를 저장합니다.
2. **평가 성공 시 버튼 비활성화 반영**:
   - `submitAssessment()` API 통신 성공(`response.ok`) 시 `[평가]` 버튼과 `[녹음]` 버튼을 `disabled = true` 처리하고 `disabled` 클래스를 추가합니다.
   - `submitAssessment()`의 `finally` 구문에서 무조건 `disabled = false` 처리하던 기존 로직을 성공 플래그(`success`)에 따라 비활성 상태가 유지되도록 변경합니다.
3. **텍스트 편집(수정) 시 리셋 기능 보완**:
   - 사용자가 텍스트 수동 편집 완료 후 저장/적용(`toggleTextEditMode`로 편집 모드 탈출)하는 순간, 이전 평가 결과는 더 이상 유효하지 않으므로 `resetEvaluationDisplay()`를 호출해 줍니다.
   - `resetEvaluationDisplay()`에서는 `[녹음]` 버튼을 다시 활성화하고 `[평가]` 버튼은 녹음 전이므로 비활성화 상태로 초기화합니다.

---

## 3. 기동 및 실행 방법 안내

본 프로젝트는 FastAPI 백엔드 웹 서버에서 프론트엔드 정적 파일들을 서빙하도록 일체화되어 있습니다. 따라서 로컬 개발 환경에서 아래의 단일 명령어로 백엔드와 프론트엔드를 동시에 가동할 수 있습니다.

### 기동 명령어
프로젝트 루트 디렉토리(`d:\49chan\12. Antigravity\20260724_KCoach_v2`)에서 터미널을 열고 아래 명령어를 실행하십시오:

```bash
# 1. uvicorn을 이용한 서버 구동 (실시간 리로드 지원)
uvicorn api.index:app --host 0.0.0.0 --port 8000 --reload

# 또는 python 진입점 직접 실행
python api/index.py
```

구동 후 웹 브라우저를 열고 **`http://localhost:8000`** 또는 외부 기기(동일 Wi-Fi 대역 모바일)의 경우 **`http://[PC의 내부IP주소]:8000`**으로 접속하여 화면을 확인 및 테스트하실 수 있습니다.
