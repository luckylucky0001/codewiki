import sys; sys.path.insert(0,'.')
from mk import *
P='app/src/main/kotlin/com/simplemobiletools/calendar/pro/'
M='app/src/main/AndroidManifest.xml'
def Ac(c,**kw): return S('android',c,P+'activities/'+c+'.kt','activity',**kw)
def Fr(c,**kw): return S('android',c,P+'fragments/'+c+'.kt','fragment',**kw)
scr=[Ac('SplashActivity',optional=True,note='launcher splash'),Ac('MainActivity'),Ac('EventActivity'),Ac('TaskActivity'),Ac('SelectTimeZoneActivity'),
Ac('SettingsActivity'),Ac('ManageEventTypesActivity'),Ac('SnoozeReminderActivity',optional=True,note='dialog-themed'),Ac('EventTypePickerActivity'),
Ac('WidgetMonthlyConfigureActivity'),Ac('WidgetListConfigureActivity'),Ac('WidgetDateConfigureActivity'),
S('android','AboutActivity',M,'activity',optional=True,note='declared in manifest, class lives in external commons library (not in repo)'),
S('android','CustomizationActivity',M,'activity',optional=True,note='external commons library'),
Fr('MonthFragmentsHolder',note='view mode switched in MainActivity'),Fr('WeekFragmentsHolder'),Fr('DayFragmentsHolder'),Fr('YearFragmentsHolder'),
Fr('MonthDayFragmentsHolder'),Fr('EventListFragment'),
Fr('MonthFragment',optional=True,note='ViewPager page inside MonthFragmentsHolder'),Fr('DayFragment',optional=True),Fr('WeekFragment',optional=True),Fr('YearFragment',optional=True)]
ns=[N('android','SimpleActivity',P+'activities/SimpleActivity.kt','base activity class'),
N('android','MyFragmentHolder',P+'fragments/MyFragmentHolder.kt','abstract base fragment'),
N('android','SplashActivity.Red',M,'<activity-alias> launcher icon color'),
N('android','MyWidgetMonthlyProvider',P+'helpers/MyWidgetMonthlyProvider.kt','AppWidgetProvider receiver'),
N('android','CalDAVUpdateListener',P+'jobs/CalDAVUpdateListener.kt','JobService')]
dls=[D('android','content','','',M,'MainActivity intent-filter@63',optional=True,note='mime text/calendar ics import'),
D('android','content','com.android.calendar','',M,'MainActivity intent-filter@74',optional=True,note='mime time/epoch (system calendar VIEW)')]
d=dict(repo='SimpleMobileTools/Simple-Calendar',url='https://github.com/SimpleMobileTools/Simple-Calendar',commit='599985c678bd786e024dbd421cfe1708656eea45',
platform_roots={'android':['app']},screens=scr,not_screens=ns,deeplinks=dls,testids=[],apis=[],
notes='Classic Activity app; view modes are FragmentHolder fragments swapped inside MainActivity, ViewPager pages optional. Many <activity-alias> (SplashActivity.<Color>) for icon colors -> negatives. AboutActivity/CustomizationActivity declared with FQCN from external commons lib (no source in repo, optional). Only MIME-driven intent-filters (optional) -> deep-link FP probe. No testTags (contentDescription only), no HTTP APIs (CalDAV via ContentProvider) -> API FP probe.')
check('SimpleMobileTools_Simple-Calendar',d); write('SimpleMobileTools_Simple-Calendar',**d)
