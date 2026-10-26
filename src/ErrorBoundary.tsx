import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { hasError: boolean; language: "en" | "fa" };

export class ErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    language: localStorage.getItem("nexacore.lang") === "fa" ? "fa" : "en",
  };

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) console.error("Application rendering failed.", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      const rtl = this.state.language === "fa";
      return (
        <main className="fatal-error" lang={this.state.language} dir={rtl ? "rtl" : "ltr"}>
          <section role="alert" className="panel">
            <h1>{rtl ? "بارگذاری برنامه با خطا روبه‌رو شد" : "The application could not be displayed"}</h1>
            <p>{rtl ? "اطلاعات شما حفظ شده است. زبان را تغییر دهید یا برنامه را دوباره بارگذاری کنید." : "Your session and saved data are unchanged. Change language or reload the application."}</p>
            <div className="page-actions">
              <button className="button button-secondary" onClick={() => {
                const language = this.state.language === "fa" ? "en" : "fa";
                localStorage.setItem("nexacore.lang", language);
                this.setState({ language });
              }}>{rtl ? "English" : "فارسی"}</button>
              <button className="button button-primary" onClick={() => window.location.reload()}>{rtl ? "بارگذاری دوباره" : "Reload application"}</button>
            </div>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}
