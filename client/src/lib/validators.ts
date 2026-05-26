export class InputValidators {
  static normalizeName(value: string): string {
    return value.trim();
  }

  static hasValue(value: string): boolean {
    return this.normalizeName(value).length > 0;
  }
}
