# 메일 도우미

유소채널(`yuso@wootso.com`)로 온 광고주 메일만 정리해서 보는 웹앱입니다.

GitHub Pages에는 화면 코드만 배포하고, 실제 메일 데이터와 Gmail OAuth 동기화는 Supabase Edge Function에서 처리합니다.

## 배포

이 앱은 GitHub Pages에서 정적 화면으로 동작합니다. 메일 데이터는 저장소에 커밋하지 않습니다.

주의: 로컬 백업 파일인 `data.local.json`에는 실제 메일 내용이 들어가므로 Git에 올리지 않습니다.

## Gmail OAuth 설정

Google Cloud Console에서 OAuth 2.0 Client를 `Web application`으로 만들고 Gmail API를 활성화합니다.

Authorized redirect URI:

```text
https://bsmfvlodkqyfawsppjno.supabase.co/functions/v1/yuso-mail/api/gmail/callback
```

Supabase Edge Function secret에 아래 값을 넣어야 Gmail 직접 동기화가 켜집니다.

```text
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GMAIL_REDIRECT_URI=https://bsmfvlodkqyfawsppjno.supabase.co/functions/v1/yuso-mail/api/gmail/callback
APP_URL=https://yusohi.github.io/yuso-advertiser-mail/
```

설정 후 웹앱의 `내 정보 > Gmail 연결`을 눌러 `yuso@wootso.com` 계정을 연결하면, 새로고침 버튼이 Gmail API를 즉시 읽고 Supabase 스냅샷을 갱신합니다.

## 휴대폰에서 앱처럼 쓰기

배포된 HTTPS 주소를 Safari에서 연 뒤 공유 버튼을 누르고 `홈 화면에 추가`를 선택하면 됩니다. 이후에는 같은 아이콘으로 열 수 있습니다.
