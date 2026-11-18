import type { ProblemSpec, Solution, SolutionStep } from '@mathtwin/core';
import { answerText, solutionDisplayText } from '../solution.vi.js';

export interface SolutionView { answer: string; steps: SolutionStep[]; notes: string[] }

export function solutionView(spec: ProblemSpec, solution: Solution): SolutionView {
  return { answer: answerText(spec, solution), steps: structuredClone(solution.steps).map((step) => ({ ...step,
    text: solutionDisplayText(spec, solution, step.text) })), notes: solution.notes.map((note) => solutionDisplayText(spec, solution, note)) };
}
