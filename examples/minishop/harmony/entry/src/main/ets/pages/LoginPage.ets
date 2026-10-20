import { Api } from '../common/Api';
import { TokenStore } from '../common/TokenStore';

@Builder
export function LoginBuilder() {
  LoginPage()
}

@Component
export struct LoginPage {
  @Consume('pathStack') pathStack: NavPathStack;
  @State username: string = '';
  @State password: string = '';

  async onSubmit(): Promise<void> {
    if (this.username.length === 0 || this.password.length < 6) {
      return;
    }
    const token = await Api.login(this.username, this.password);
    TokenStore.save(token);
    this.pathStack.replacePathByName('products', null);
  }

  build() {
    NavDestination() {
      Column() {
        TextInput({ placeholder: 'Username' }).id('login_username')
          .onChange((v: string) => { this.username = v; })
        TextInput({ placeholder: 'Password' }).id('login_password').type(InputType.Password)
          .onChange((v: string) => { this.password = v; })
        Button('Sign in').id('login_submit').onClick(() => { this.onSubmit(); })
      }
    }
  }
}
