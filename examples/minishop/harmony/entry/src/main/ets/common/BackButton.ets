@Component
export struct BackButton {
  @Consume('pathStack') pathStack: NavPathStack;

  build() {
    Button('Back')
      .id('nav_back')
      .onClick(() => {
        this.pathStack.pop();
      })
  }
}
