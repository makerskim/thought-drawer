// 구글 로그인 설정. docs/설정가이드.md의 "2. 구글 로그인 켜기" 단계에서 만든
// OAuth 클라이언트 ID를 아래에 붙여 넣으세요. 비어 있으면 로그인 화면에 설정 안내가 나와요.
export const GOOGLE_CLIENT_ID = '554345609466-4kvualcaa6hblbtju9a5i81qbsfigopa.apps.googleusercontent.com';

// 이 앱을 쓸 수 있는 구글 계정 (나만 쓰기). 메일 주소 자체는 공개 코드에 두지 않고 지문(SHA-256)만 둔다.
// 다른 계정을 더하려면 그 메일 주소의 지문을 하나 더 넣는다:
//   node -e "console.log(require('crypto').createHash('sha256').update('메일주소'.trim().toLowerCase()).digest('hex'))"
// 비우면([]) 누구나 자기 구글 계정으로 쓸 수 있다.
export const OWNERS = ['d0a26c8f455fd1b790cdec502b9d9edc949768f5aaacca086d09b7e9d3e77a58'];

// 드라이브 안의 폴더 이름
export const ROOT_FOLDER = '메모';
export const INBOX_DIR = '00_인박스';
export const ATTACH_DIR = '_첨부';
export const SYSTEM_DIR = '_시스템';

// 앱 주소와 크롬 확장 프로그램 번호 (확장 프로그램의 구글 로그인 돌아올 주소에 쓰인다)
export const APP_URL = 'https://makerskim.github.io/thought-drawer/';
export const EXTENSION_ID = 'fifpgndooniiilnpibpjfkchpfmkppen';
export const EXTENSION_ZIP = 'downloads/thought-drawer-chrome.zip';
