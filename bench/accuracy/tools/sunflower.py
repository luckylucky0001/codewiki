import sys; sys.path.insert(0,'.')
from mk import *
P='app/src/main/java/com/google/samples/apps/sunflower/'
SC=P+'compose/Screen.kt'
scr=[S('android','home',SC,'compose-route',symbol='Screen.Home',screen_fn='HomeScreen',pattern='home'),
S('android','plantDetail/{plantId}',SC,'compose-route',symbol='Screen.PlantDetail',screen_fn='PlantDetailsScreen',pattern='plantDetail/{plantId}'),
S('android','gallery/{plantName}',SC,'compose-route',symbol='Screen.Gallery',screen_fn='GalleryScreen',pattern='gallery/{plantName}'),
S('android','HomeScreen',P+'compose/home/HomeScreen.kt','compose-screen',alt_of='home'),
S('android','PlantDetailsScreen',P+'compose/plantdetail/PlantDetailView.kt','compose-screen',alt_of='plantDetail/{plantId}'),
S('android','GalleryScreen',P+'compose/gallery/GalleryScreen.kt','compose-screen',alt_of='gallery/{plantName}'),
S('android','GardenActivity',P+'GardenActivity.kt','activity'),
S('android','GardenScreen',P+'compose/garden/GardenScreen.kt','pager-page',optional=True,note='HorizontalPager page (SunflowerPage.MY_GARDEN) inside HomeScreen, not a nav route'),
S('android','PlantListScreen',P+'compose/plantlist/PlantListScreen.kt','pager-page',optional=True,note='HorizontalPager page (SunflowerPage.PLANT_LIST)')]
ns=[N('android','Screen',SC,'sealed base class of routes'),N('android','GardenScreenPreview',P+'compose/garden/GardenScreen.kt','@Preview'),N('android','PlantListScreenPreview',P+'compose/plantlist/PlantListScreen.kt','@Preview'),
N('android','PlantListItem',P+'compose/plantlist/PlantListItemView.kt','list item'),N('android','PlantDetailsScroller',P+'compose/plantdetail/PlantDetailScroller.kt','scroll helper'),N('android','TextSnackbarContainer',P+'compose/utils/TextSnackbarContainer.kt','utility container')]
tids=[T('android','plant_list',P+'compose/plantlist/PlantListScreen.kt',59)]
apis=[A('GET','search/photos',P+'api/UnsplashService.kt',note='Retrofit @GET, BASE_URL https://api.unsplash.com/')]
cl=[C('C1','The AndroidViewBinding API is used to embed a TextView in Compose. See the PlantDescription composable in PlantDetailView','README.md','verified',P+'compose/plantdetail/PlantDetailView.kt:549'),
C('C2','add unsplash_access_key=<key> to gradle.properties','README.md','verified','app/build.gradle.kts:166'),
C('C3','Sunflower uses the Unsplash API to load pictures on the gallery screen','README.md','verified',P+'api/UnsplashService.kt'),
C('C4','migrate an existing View-based app (Material 2) to Compose (Material 3)','README.md','verified','gradle/libs.versions.toml:46 material3'),
C('C5','Sunflower uses ktlint to enforce Kotlin coding styles','README.md','verified','gradle/libs.versions.toml:42 ktlint'),
C('C6','The app is still usable without an API key, though you will not be able to navigate to the gallery screen','README.md','unverifiable',P+'compose/SunflowerApp.kt',note='runtime behaviour; gallery route is always registered - would need runtime check'),
C('C7','see the migration journey document docs/MigrationJourney.md','README.md','verified','docs/MigrationJourney.md'),
C('C8','Gallery screen receives plantName argument','(derived from Screen.kt doc comment / route)','verified',SC,synthetic=True),
C('C9','To see the original View implementation, checkout the views branch','README.md','unverifiable','(git branch, not in tree)'),
C('C10','For development, the latest version of Android Studio is required','README.md','unverifiable','(tooling requirement)')]
write('android_sunflower',repo='android/sunflower',url='https://github.com/android/sunflower',commit='2a357a31551bb53f3fe80382a9ce6d30bcc8b960',
platform_roots={'android':['app']},screens=scr,not_screens=ns,deeplinks=[],testids=tids,apis=apis,claims=cl,
notes='Navigation-compose string routes defined in sealed class Screen (route strings with {args}); route_id = route string; symbol = Screen.X; screen composables listed with alt_of. Garden/PlantList are HorizontalPager pages (optional). Only 1 testTag. No deep links. Clone reused read-only from oss2.')
