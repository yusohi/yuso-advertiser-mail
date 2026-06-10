# 유소 광고주 메일 파이프라인

유소채널(`yuso@wootso.com`)로 온 광고주 메일만 정리해서 보는 정적 웹앱입니다.

## 배포

이 앱은 `index.html`, `styles.css`, `app.js`, `data.json`만 있으면 동작합니다. 고정 URL로 쓰려면 Render Static Site, GitHub Pages, Cloudflare Pages 같은 정적 호스팅에 올리면 됩니다.

Render를 쓰는 경우 이 저장소를 GitHub/GitLab/Bitbucket에 올린 뒤 `render.yaml` Blueprint로 배포하면 됩니다.

주의: `data.json` 안에는 실제 메일 내용이 들어갑니다. 공개 저장소나 공개 URL에 올리면 링크를 아는 사람이 내용을 볼 수 있습니다.

## 휴대폰에서 앱처럼 쓰기

배포된 HTTPS 주소를 Safari에서 연 뒤 공유 버튼을 누르고 `홈 화면에 추가`를 선택하면 됩니다. 이후에는 같은 아이콘으로 열 수 있습니다.
