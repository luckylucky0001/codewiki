// Unit tests for the generic extraction helpers tuned against bench/accuracy.
import { describe, expect, it } from 'vitest';
import { supertypes, urlRoutingRoutes, linkString } from '../../src/facts/facts.js';

describe('supertypes', () => {
  it('kotlin: skips primary-constructor and annotation colons', () => {
    expect(supertypes({ lang: 'kotlin', signature: 'data class ShowDetailsScreen(val id: Long) : TiviScreen(name = "ShowDetails()")' })).toEqual(['TiviScreen']);
    expect(supertypes({ lang: 'kotlin', signature: '@Serializable data object GoldenKodeeScreen : AppRoute, NavKey' })).toEqual(['AppRoute', 'NavKey']);
  });
  it('swift: generics and where clauses', () => {
    expect(supertypes({ lang: 'swift', signature: 'struct SettingsNavigationLink<Destination: View>: View where Destination: View' })).toEqual(['View']);
    expect(supertypes({ lang: 'swift', signature: 'final class MainWindowController: NSWindowController, NSUserInterfaceValidations' })).toEqual(['NSWindowController', 'NSUserInterfaceValidations']);
  });
  it('java: extends / implements', () => {
    expect(supertypes({ lang: 'java', signature: 'public class InboxFragment extends EpisodesListFragment implements Toolbar.OnMenuItemClickListener' })).toEqual(['EpisodesListFragment', 'OnMenuItemClickListener']);
  });
});

describe('swift-url-routing DSL', () => {
  it('nests Route paths, mounts router variables, inherits methods', () => {
    const src = `
import URLRouting
struct R {
  var body: some Router<Route> {
    OneOf {
      Route(.case(Route.api)) {
        Path { "api" }
        self.apiRouter
      }
      Route(.case(Route.home))
    }
  }
  var apiRouter: some Router<Api> {
    let pushRouter = OneOf {
      Route(.case(Push.register)) {
        Method.post
        Path { "push-tokens" }
      }
    }
    return OneOf {
      Route(.case(Api.config)) { Path { "config" } }
      Route(.case(Api.push)) { pushRouter }
      Route(.case(Api.word)) {
        Path {
          "words"
          UUID.parser()
        }
      }
    }
  }
}`;
    expect(urlRoutingRoutes(src).map((r) => r.method + ' ' + r.path).sort()).toEqual(['GET /api/config', 'GET /api/words/{UUID}', 'POST /api/push-tokens']);
  });
});

describe('deep links', () => {
  it('formats declared links', () => {
    expect(linkString({ scheme: 'https', host: 'antennapod.org', path: '/deeplink/main' })).toBe('https://antennapod.org/deeplink/main');
    expect(linkString({ scheme: '', host: '', path: '/projects/:id' })).toBe('/projects/:id');
  });
});
