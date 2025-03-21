import * as core from '@actions/core';
import { CoverageReport } from './Model/CoverageReport';
import { DiffCoverageReport } from './Model/DiffCoverageReport';
import { CoverageData } from './Model/CoverageData';
import { DiffFileCoverageData } from './Model/DiffFileCoverageData';
import { DiffCoverageData } from './Model/DiffCoverageData';

export const increasedCoverageIcon = ':chart:'; // "Chart Increasing with Yen"
export const decreasedCoverageIcon = ':small_red_triangle_down:';
export const unchangedCoverageIcon = '&nbsp;';
export const newCoverageIcon = ':new:';
export const removedCoverageIcon = ':fire:';

export class DiffChecker {
  private diffCoverageReport: DiffCoverageReport = {};
  constructor(
    coverageReportNew: CoverageReport,
    coverageReportOld: CoverageReport
  ) {
    const reportNewKeys = Object.keys(coverageReportNew);
    const reportOldKeys = Object.keys(coverageReportOld);
    const reportKeys = new Set([...reportNewKeys, ...reportOldKeys]);

    for (const filePath of reportKeys) {
      this.diffCoverageReport[filePath] = {
        branches: {
          newPct: this.getPercentage(coverageReportNew[filePath]?.branches),
          oldPct: this.getPercentage(coverageReportOld[filePath]?.branches)
        },
        statements: {
          newPct: this.getPercentage(coverageReportNew[filePath]?.statements),
          oldPct: this.getPercentage(coverageReportOld[filePath]?.statements)
        },
        lines: {
          newPct: this.getPercentage(coverageReportNew[filePath]?.lines),
          oldPct: this.getPercentage(coverageReportOld[filePath]?.lines)
        },
        functions: {
          newPct: this.getPercentage(coverageReportNew[filePath]?.functions),
          oldPct: this.getPercentage(coverageReportOld[filePath]?.functions)
        }
      };
    }
  }

  getCoverageDetails(
    fullCoverageDiff: boolean,
    currentDirectory: string
  ): string[] {
    const keys = Object.keys(this.diffCoverageReport);
    const returnStrings: string[] = [];
    for (const key of keys) {
      if (this.compareCoverageValues(this.diffCoverageReport[key]) !== 0) {
        returnStrings.push(
          this.createDiffLine(
            this.getPrettyFilepath(key).replace(currentDirectory, ''),
            this.diffCoverageReport[key]
          )
        );
      } else {
        if (fullCoverageDiff) {
          const statusIcon = unchangedCoverageIcon;
          const name = this.getPrettyFilepath(key).replace(
            currentDirectory,
            ''
          );
          returnStrings.push(
            `${statusIcon} | ${name} | ${fixed2(
              this.diffCoverageReport[key].statements.newPct
            )}%<br>&nbsp; | ${fixed2(
              this.diffCoverageReport[key].branches.newPct
            )}%<br>&nbsp; | ${fixed2(
              this.diffCoverageReport[key].functions.newPct
            )}%<br>&nbsp; | ${fixed2(
              this.diffCoverageReport[key].lines.newPct
            )}%<br>&nbsp;`
          );
        }
      }
    }
    return returnStrings;
  }

  checkIfTestCoverageFallsBelowDelta(
    delta: number | null,
    totalDelta: number | null
  ): void {
    const files = Object.keys(this.diffCoverageReport);
    for (const file of files) {
      const diffCoverageData = this.diffCoverageReport[file];
      const keys: ('lines' | 'statements' | 'branches' | 'functions')[] = <
        ('lines' | 'statements' | 'branches' | 'functions')[]
      >Object.keys(diffCoverageData);
      // No new coverage found so that means we deleted a file coverage
      const fileRemovedCoverage = Object.values(diffCoverageData).every(
        coverageData => coverageData.newPct === 0
      );
      if (fileRemovedCoverage) {
        core.info(
          `${file} : deleted or renamed and is not considered for coverage diff.`
        );
        // since the file is deleted don't include in delta calculation
        continue;
      }
      for (const key of keys) {
        if (diffCoverageData[key].oldPct !== diffCoverageData[key].newPct) {
          const deltaToCompareWith = file === 'total' ? totalDelta : delta;
          if (deltaToCompareWith === null) continue;
          if (
            -this.getPercentageDiff(diffCoverageData[key]) > deltaToCompareWith
          ) {
            const percentageDiff = this.getPercentageDiff(
              diffCoverageData[key]
            );
            throw new Error(
              `Test coverage change of ${percentageDiff}% is greater than max allowed (${deltaToCompareWith}%) for ${key} in ${file}`
            );
          }
        }
      }
    }
  }

  private createDiffLine(
    name: string,
    diffFileCoverageData: DiffFileCoverageData
  ): string {
    // No old coverage found so that means we added a new file coverage
    const fileNewCoverage = Object.values(diffFileCoverageData).every(
      coverageData => coverageData.oldPct === 0
    );
    // No new coverage found so that means we deleted a file coverage
    const fileRemovedCoverage = Object.values(diffFileCoverageData).every(
      coverageData => coverageData.newPct === 0
    );
    if (fileNewCoverage) {
      return `${newCoverageIcon} | **${name}** | **${fixed2(diffFileCoverageData.statements.newPct)}%**<br>&nbsp; | **${fixed2(diffFileCoverageData.branches.newPct)}%**<br>&nbsp; | **${fixed2(diffFileCoverageData.functions.newPct)}%**<br>&nbsp; | **${fixed2(diffFileCoverageData.lines.newPct)}%**<br>&nbsp;`;
    } else if (fileRemovedCoverage) {
      return `${removedCoverageIcon} | ~~${name}~~ | ~~${fixed2(diffFileCoverageData.statements.oldPct)}%~~<br>&nbsp; | ~~${fixed2(diffFileCoverageData.branches.oldPct)}%~~<br>&nbsp; | ~~${fixed2(diffFileCoverageData.functions.oldPct)}%~~<br>&nbsp; | ~~${fixed2(diffFileCoverageData.lines.oldPct)}%~~<br>&nbsp;`;
    }
    // Coverage existed before so calculate the diff status
    const statusIcon = this.getStatusIcon(diffFileCoverageData);
    return `${statusIcon} | ${name} | ${fixed2(
      diffFileCoverageData.statements.newPct
    )}%<br>${this.getPrettyPctDiff(diffFileCoverageData.statements)} | ${fixed2(
      diffFileCoverageData.branches.newPct
    )}%<br>${this.getPrettyPctDiff(diffFileCoverageData.branches)} | ${fixed2(
      diffFileCoverageData.functions.newPct
    )}%<br>${this.getPrettyPctDiff(diffFileCoverageData.functions)} | ${fixed2(
      diffFileCoverageData.lines.newPct
    )}%<br>${this.getPrettyPctDiff(diffFileCoverageData.lines)}`;
  }

  private compareCoverageValues(
    diffCoverageData: DiffFileCoverageData
  ): number {
    const keys: ('lines' | 'statements' | 'branches' | 'functions')[] = <
      ('lines' | 'statements' | 'branches' | 'functions')[]
    >Object.keys(diffCoverageData);
    for (const key of keys) {
      if (diffCoverageData[key].oldPct !== diffCoverageData[key].newPct) {
        return 1;
      }
    }
    return 0;
  }

  private getPercentage(coverageData: CoverageData): number {
    return coverageData?.pct || 0;
  }

  private getStatusIcon(diffFileCoverageData: DiffFileCoverageData): string {
    let overallDiff = 0;
    Object.values(diffFileCoverageData).forEach(coverageData => {
      overallDiff = overallDiff + this.getPercentageDiff(coverageData);
    });
    if (overallDiff < 0) {
      return decreasedCoverageIcon;
    } else if (overallDiff > 0) {
      return increasedCoverageIcon;
    } else {
      return unchangedCoverageIcon;
    }
  }

  private getPercentageDiff(diffData: DiffCoverageData): number {
    // get diff
    const diff = Number(diffData.newPct) - Number(diffData.oldPct);
    // round off the diff to 2 decimal places
    return Math.round((diff + Number.EPSILON) * 100) / 100;
  }

  private getPrettyPctDiff(diffData: DiffCoverageData): string {
    const number = this.getPercentageDiff(diffData);
    if (number === 0) return '&nbsp;';
    return `**(${number > 0 ? '+' : ''}${number.toFixed(2)})**`;
  }

  private getPrettyFilepath(filepath: string) {
    if (filepath === 'total') {
      return '(Total of all source files)';
    }
    return filepath;
  }
}

function fixed2(n: number | undefined): string | undefined {
  return n?.toFixed(2);
}
