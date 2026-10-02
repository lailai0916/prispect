import { ZxcvbnFactory } from '@zxcvbn-ts/core';
import * as common from '@zxcvbn-ts/language-common';
import * as en from '@zxcvbn-ts/language-en';

const estimator = new ZxcvbnFactory({
  dictionary: { ...common.dictionary, ...en.dictionary },
  graphs: common.adjacencyGraphs,
  translations: en.translations,
});
export function passwordStrength(password: string, userInputs: string[] = []) {
  if (!password) return 0;
  return estimator.check(password, userInputs).score;
}
export function validNewPassword(password: unknown, userInputs: string[] = []): password is string {
  return (
    typeof password === 'string' &&
    password.length >= 12 &&
    password.length <= 128 &&
    passwordStrength(password, userInputs) >= 3
  );
}
