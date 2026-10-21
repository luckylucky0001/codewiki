import sys; sys.path.insert(0,'.')
from mk import *
C='Simplenote/Classes/'
def V(c,f,**kw): return S('ios',c,f,'uikit-vc',**kw)
scr=[V('SPNoteListViewController',C+'SPNoteListViewController.m',lang='objc'),V('SPNoteEditorViewController',C+'SPNoteEditorViewController.m',lang='objc'),
V('SPSettingsViewController',C+'SPSettingsViewController.m',lang='objc'),V('TagListViewController','Simplenote/TagListViewController.swift',note='sidebar'),
V('SPAuthViewController',C+'SPAuthViewController.swift'),V('SPOnboardingViewController',C+'SPOnboardingViewController.swift'),
V('SPAboutViewController',C+'SPAboutViewController.swift'),V('SPPrivacyViewController','Simplenote/SPPrivacyViewController.swift'),
V('SPThemeViewController',C+'SPThemeViewController.swift'),V('SPSortOrderViewController',C+'SPSortOrderViewController.swift'),
V('SPNoteHistoryViewController',C+'SPNoteHistoryViewController.swift'),V('NoteInformationViewController','Simplenote/Information/NoteInformationViewController.swift'),
V('PinLockViewController',C+'PinLock/PinLockViewController.swift',note='xib-backed; driven by PinLockSetup/Verify/Remove controllers'),
V('SPMarkdownPreviewViewController',C+'SPMarkdownPreviewViewController.m',lang='objc'),V('SPAddCollaboratorsViewController',C+'SPAddCollaboratorsViewController.m',lang='objc'),
V('AccountVerificationViewController','Simplenote/Verification/AccountVerificationViewController.swift'),
V('OptionsViewController',C+'OptionsViewController.swift',note='note options sheet'),
V('SignupVerificationViewController',C+'SignupVerificationViewController.swift'),
V('SPDebugViewController',C+'SPDebugViewController.m',lang='objc',optional=True,note='debug-only'),
V('SPDiagnosticsViewController',C+'SPDiagnosticsViewController.swift',optional=True),
V('SortModePickerViewController',C+'SortModePickerViewController.swift',optional=True,note='popover picker'),
V('NoteEditorTagListViewController','Simplenote/Tags/NoteEditorTagListViewController.swift',optional=True,note='embedded tag bar in editor')]
ns=[N('ios','SPTableViewController',C+'SPTableViewController.m','base class'),
N('ios','SPSidebarContainerViewController',C+'SPSidebarContainerViewController.m','container that hosts list+sidebar',borderline=True),
N('ios','SpinnerViewController','Simplenote/SpinnerViewController.swift','loading overlay'),
N('ios','InterlinkViewController',C+'InterlinkViewController.swift','autocomplete popover child'),
N('ios','PopoverViewController',C+'PopoverViewController.swift','generic popover container'),
N('ios','PinLockSetupController',C+'PinLock/PinLockSetupController.swift','controller/presenter object, not a UIViewController')]
PL='Simplenote/Supporting Files/Simplenote-Info.plist'; AD='Simplenote/SPAppDelegate.m'
dls=[D('ios','simplenote','','',PL,'CFBundleURLSchemes'),
D('ios','simplenote','note','/{key}','Simplenote/Classes/NSURL+Links.swift','SimplenoteConstants.simplenoteInterlinkHost',kind='in-app-url'),
D('ios','simplenote','list','',AD,'handleOpenTagListWithUrl / simplenoteInternalTagHost',kind='in-app-url'),
D('ios','simplenote','new','',AD,'openURL host isEqualToString:@"new"',kind='in-app-url'),
D('ios','simplenote','widgetNew','',AD,'openURL host widgetNew',kind='in-app-url'),
D('ios','simplenote','login','',C+'MagicLinkAuthenticator.swift','AllowedHosts.hostForSimplenoteSchema',kind='in-app-url'),
D('ios','https','app.simplenote.com','','Simplenote/Supporting Files/Simplenote.entitlements','applinks')]
tids=[T('ios','Main Action',C+'SPAuthViewController.swift',107),T('ios','menu',C+'SPNoteListViewController.m',296),
T('ios','search-bar',C+'SPNoteListViewController.m',350),T('ios','passcode-cell',C+'SPSettingsViewController.m',407),
T('ios','note-menu',C+'SPNoteEditorViewController+Extensions.swift',37),T('ios','all-notes','Simplenote/TagListViewController.swift',350),
T('ios','settings','Simplenote/TagListViewController.swift',358)]
SC=C+'SimplenoteConstants.swift'
apis=[A('POST','{base}/{appId}/{bucket}/i/{key}','SimplenoteShare/Simperium/Uploader.swift',note='String(format:"%@/%@/%@/i/%@", kSimperiumBaseURL, ...)'),
A('GET','{base}/{appId}/{bucket}/i/{key}','SimplenoteShare/Simperium/Downloader.swift'),
A('ANY','/account/request-login',SC,optional=True,note='constant appended to runtime engine URL; unused in-repo (AccountRemote/LoginRemote live in external SimplenoteEndpoints package)'),
A('ANY','/account/request-signup',SC,optional=True),A('ANY','/account/request-delete/',SC,optional=True),
A('GET','/settings',SC,optional=True,note='opened in browser, not an API call')]
d=dict(repo='Automattic/simplenote-ios',url='https://github.com/Automattic/simplenote-ios',commit='29bd22351aaa45934c5dce41577571c64e1cbfbe',
platform_roots={'ios':['Simplenote','SimplenoteShare','SimplenoteWidgets','SimplenoteIntents']},screens=scr,not_screens=ns,deeplinks=dls,testids=tids,apis=apis,
notes='Mixed ObjC (.h/.m) + Swift UIKit app; ObjC VCs labelled with .m file (extractor reporting .h should still match via id). URL scheme simplenote:// with hosts dispatched in SPAppDelegate openURL (new/widgetNew) and helpers (note/list/login). Real network layer is external SPM package SimplenoteEndpoints + Simperium -> very few in-repo API literals; share extension builds URL via String(format:). testIDs exhaustive (7 literal accessibilityIdentifier).')
check('Automattic_simplenote-ios',d); write('Automattic_simplenote-ios',**d)
