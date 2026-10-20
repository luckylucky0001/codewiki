import { TokenStore } from '../common/TokenStore';

@Entry
@Component
struct Index {
  @Provide('pathStack') pathStack: NavPathStack = new NavPathStack();

  aboutToAppear(): void {
    const uri: string = AppStorage.get<string>('pendingUri') ?? '';
    this.openDeepLink(uri);
  }

  openDeepLink(uri: string): void {
    if (!uri.startsWith('minishop://')) {
      this.pathStack.pushPathByName(TokenStore.isLoggedIn() ? 'products' : 'login', null);
      return;
    }
    const path = uri.substring('minishop://'.length).split('?')[0];
    const parts = path.split('/');
    if (parts[0] === 'product') {
      this.pathStack.pushPathByName('product_detail', { id: parts[1] });
    } else if (parts[0] === 'order') {
      this.pathStack.pushPathByName('order_detail', { id: parts[1] });
    } else {
      this.pathStack.pushPathByName(parts[0], null);
    }
  }

  build() {
    Navigation(this.pathStack) {
    }
    .hideTitleBar(true)
  }
}
