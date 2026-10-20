export class TokenStore {
  private static token: string = '';

  static save(token: string): void {
    TokenStore.token = token;
  }

  static get(): string {
    return TokenStore.token;
  }

  static isLoggedIn(): boolean {
    return TokenStore.token.length > 0;
  }
}
