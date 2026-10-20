import { UIAbility, Want, AbilityConstant } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import { TokenStore } from '../common/TokenStore';
import { CartStore } from '../common/CartStore';

export default class EntryAbility extends UIAbility {
  onCreate(want: Want, launchParam: AbilityConstant.LaunchParam): void {
    this.applyTestParams(want.uri);
    AppStorage.setOrCreate('pendingUri', want.uri ?? '');
  }

  // minishop://<pattern>?token=<t>&cart=<sku,sku>
  applyTestParams(uri?: string): void {
    if (!uri || uri.indexOf('?') < 0) {
      return;
    }
    const query = uri.substring(uri.indexOf('?') + 1);
    for (const pair of query.split('&')) {
      const kv = pair.split('=');
      if (kv[0] === 'token') {
        TokenStore.save(kv[1]);
      } else if (kv[0] === 'cart') {
        CartStore.preload(kv[1].split(','));
      }
    }
  }

  onWindowStageCreate(windowStage: window.WindowStage): void {
    windowStage.loadContent('pages/Index');
  }
}
