# 생각서랍 자동 정리 (Claude Code 예약 작업이 따르는 순서)

구독 사용량을 아끼는 게 가장 중요하다. 아래 순서 말고 다른 파일을 읽거나 탐색하지 않는다.

1. `python3 organizer/organize.py prepare` 를 실행한다.
   - "정리할 카드 없음"이 나오면 **바로 끝낸다.** 다른 일은 하지 않는다.
   - 환경 변수나 인증 오류가 나면 오류 문장을 그대로 한 줄로 남기고 끝낸다.
2. `organizer/work/batch.md` 를 읽는다. 맨 위의 "정리 규칙"을 따른다.
   - "사진:" 경로가 적힌 카드만 그 사진 파일을 연다.
3. 모든 카드의 결정을 JSON 배열 하나로 `organizer/work/decisions.json` 에 쓴다.
4. `python3 organizer/organize.py apply` 를 실행한다.
   - 고칠 점이 출력되면 decisions.json을 고쳐서 다시 실행한다. 최대 두 번.
5. 끝. 정리한 장수를 한 줄로 남긴다. 커밋, 푸시, PR은 하지 않는다.
