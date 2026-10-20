# 登录模块说明（2023 版，已部分过时）

- 登录使用手机号 + 短信验证码：先调用 `POST /api/sms/send` 发送验证码，再调用 `POST /api/login` 校验。
- 登录页的输入框 testID 为 `login_username`、`login_password`，提交按钮为 `login_submit`。
- 登录成功后跳转到商品列表 `minishop://products`。
- 登录逻辑集中在 `LoginViewModel.login` 中。
- 会话 token 由 `SessionManager.saveToken()` 持久化。
