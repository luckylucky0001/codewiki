import sys; sys.path.insert(0,'.')
from mk import *
CA='app/src/main/kotlin/co/touchlab/kampkit/android/ui/Composables.kt'
IB='ios/KaMPKitiOS/BreedListScreen.swift'
scr=[S('android','MainActivity','app/src/main/kotlin/co/touchlab/kampkit/android/MainActivity.kt','activity'),
S('android','MainScreen',CA,'compose-screen',note='only screen composable, set from MainActivity.setContent'),
S('ios','BreedListScreen',IB,'swiftui-destination',note='root view from AppDelegate')]
ns=[N('android','MainScreenContentPreview_Success',CA,'@Preview'),N('android','MainScreenContentPreview_Empty',CA,'@Preview'),
N('android','MainScreenContent',CA,'stateless content composable of MainScreen'),N('android','DogRow',CA,'list row'),
N('ios','BreedListContent',IB,'content subview'),N('ios','BreedListScreen_Previews',IB,'PreviewProvider'),N('ios','BreedRowView',IB,'row view')]
apis=[A('GET','/api/breeds/list/all','shared/src/commonMain/kotlin/co/touchlab/kampkit/ktor/DogApiImpl.kt',note='Ktor client.get { url { takeFrom("https://dog.ceo/"); encodedPath = path } } via helper dogs(path); base https://dog.ceo/')]
G='docs/GENERAL_ARCHITECTURE.md'
cl=[C('C1','Kermit - Logging','docs/GENERAL_ARCHITECTURE.md','verified','gradle/libs.versions.toml:21 kermit'),
C('C2','SqlDelight - Database',G,'verified','gradle/libs.versions.toml:26 sqlDelight'),
C('C3','Ktor - Networking',G,'verified','shared/src/commonMain/kotlin/co/touchlab/kampkit/ktor/DogApiImpl.kt'),
C('C4','Multiplatform Settings - Settings',G,'verified','gradle/libs.versions.toml:24'),
C('C5','Koin - Dependency Injection',G,'verified','shared/src/commonMain/kotlin/co/touchlab/kampkit/Koin.kt'),
C('C6','it first checks to see if it has done a network request within the past hour',G,'verified','shared/src/commonMain/kotlin/co/touchlab/kampkit/models/BreedRepository.kt:51 oneHourMS'),
C('C7','with SKIE, iOS code can reference the common BreedViewModel directly',G,'verified','ios/KaMPKitiOS/BreedListScreen.swift; gradle/libs.versions.toml:22 skie'),
C('C8','BreedRepository references DogApiImpl (implementing DogApi) and DatabaseHelper',G,'verified','shared/src/commonMain/kotlin/co/touchlab/kampkit/models/BreedRepository.kt'),
C('C9','You will need JVM 17','README.md','unverifiable','app/build.gradle.kts:40 jvmToolchain(11)',note='toolchain targets 11; JVM 17 is a host requirement for AGP, not checkable from code'),
C('C10','Turbine (testing library)',G,'verified','gradle/libs.versions.toml:25 turbine')]
write('touchlab_KaMPKit',repo='touchlab/KaMPKit',url='https://github.com/touchlab/KaMPKit',commit='4af02006be4be589e6848f097a92d97539300821',
platform_roots={'kmp':['shared'],'android':['app'],'ios':['ios']},screens=scr,not_screens=ns,deeplinks=[],testids=[],apis=apis,claims=cl,
notes='Tiny KMP sample: single screen per platform, no deep links (no VIEW intent-filter, no CFBundleURLTypes), no testTag/accessibilityIdentifier. Good precision probe: everything extra is a false positive. Fewer than 15 screens because the app has only one.')
