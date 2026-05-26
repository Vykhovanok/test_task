import { Component, type ChangeEvent, type FormEvent } from "react";
import type {
  LoginFormValues,
  RegisterFormValues,
} from "@/lib/auth.types";
import { PrimaryButton } from "@/components/common/PrimaryButton";

type AuthMode = "login" | "register";

type LoginFormProps = {
  mode: AuthMode;
  isSubmitting: boolean;
  error: string | null;
  onModeChange: (mode: AuthMode) => void;
  onLogin: (values: LoginFormValues) => void;
  onRegister: (values: RegisterFormValues) => void;
};

type LoginFormState = {
  email: string;
  name: string;
  password: string;
};

export class LoginForm extends Component<LoginFormProps, LoginFormState> {
  state: LoginFormState = {
    email: "",
    name: "",
    password: "",
  };

  handleFieldChange =
    (field: keyof LoginFormState) => (event: ChangeEvent<HTMLInputElement>) => {
      this.setState({
        [field]: event.target.value,
      } as Pick<LoginFormState, keyof LoginFormState>);
    };

  handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (this.props.mode === "register") {
      this.props.onRegister({
        email: this.state.email,
        name: this.state.name,
        password: this.state.password,
      });
      return;
    }

    this.props.onLogin({
      email: this.state.email,
      password: this.state.password,
    });
  };

  render() {
    const { mode, isSubmitting, error } = this.props;
    const isRegister = mode === "register";

    return (
      <form
        className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"
        onSubmit={this.handleSubmit}
      >
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
            File Storage
          </span>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">
            {isRegister ? "Create account" : "Sign in"}
          </h1>
          <p className="mt-1.5 text-sm text-slate-500">
            {isRegister
              ? "Register to start managing files and folders."
              : "Sign in with your account."}
          </p>
        </div>

        <div className="mt-6 space-y-4">
          {isRegister ? (
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-700">
                Name
              </span>
              <input
                autoComplete="name"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 transition focus:border-slate-400 focus:bg-white"
                onChange={this.handleFieldChange("name")}
                placeholder="Jane Doe"
                type="text"
                value={this.state.name}
              />
            </label>
          ) : null}

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-700">
              Email
            </span>
            <input
              autoComplete="email"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 transition focus:border-slate-400 focus:bg-white"
              onChange={this.handleFieldChange("email")}
              placeholder="user@example.com"
              type="email"
              value={this.state.email}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-700">
              Password
            </span>
            <input
              autoComplete={isRegister ? "new-password" : "current-password"}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 transition focus:border-slate-400 focus:bg-white"
              onChange={this.handleFieldChange("password")}
              placeholder="Your password"
              type="password"
              value={this.state.password}
            />
          </label>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="mt-5 space-y-3">
          <PrimaryButton disabled={isSubmitting} type="submit">
            {isSubmitting
              ? isRegister
                ? "Creating account…"
                : "Signing in…"
              : isRegister
                ? "Create account"
                : "Sign in"}
          </PrimaryButton>
          <button
            className="w-full text-center text-sm text-slate-500 transition hover:text-slate-800"
            onClick={() =>
              this.props.onModeChange(isRegister ? "login" : "register")
            }
            type="button"
          >
            {isRegister
              ? "Already have an account? Sign in"
              : "Need an account? Register"}
          </button>
        </div>
      </form>
    );
  }
}
