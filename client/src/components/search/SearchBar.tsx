import { Component, type ChangeEvent } from "react";

type Props = {
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
};

export class SearchBar extends Component<Props> {
  handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    this.props.onChange(event.target.value);
  };

  render() {
    return (
      <div className="w-full sm:w-64">
        <input
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 transition focus:border-slate-400 focus:bg-white"
          onChange={this.handleChange}
          placeholder={this.props.placeholder ?? "Search…"}
          value={this.props.value}
        />
      </div>
    );
  }
}
