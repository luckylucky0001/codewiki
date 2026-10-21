package com.minishop.data;

/** Legacy Java token holder (kept in Java on purpose: mixed-language module). */
public final class TokenStore {
    private static TokenStore instance;
    private String token;

    private TokenStore() {}

    public static synchronized TokenStore getInstance() {
        if (instance == null) {
            instance = new TokenStore();
        }
        return instance;
    }

    public void save(String token) {
        this.token = token;
    }

    public boolean isLoggedIn() {
        return token != null && !token.isEmpty();
    }
}
