import { TokenStore } from '../common/TokenStore';
import { BackButton } from '../common/BackButton';

@Builder
export function ProfileBuilder() {
  ProfilePage()
}

@Component
export struct ProfilePage {
  @Consume('pathStack') pathStack: NavPathStack;

  build() {
    NavDestination() {
      Column() {
        BackButton()
        Text(TokenStore.isLoggedIn() ? 'Signed in' : 'Guest').id('profile_name')
        Button('Log out').id('profile_logout').onClick(() => {
          TokenStore.save('');
          this.pathStack.clear();
          this.pathStack.pushPathByName('login', null);
        })
      }
    }
  }
}
