import * as core from '@actions/core';
import * as github from '@actions/github';
import { execSync } from 'child_process';
import fs from 'fs';
import { CoverageReport } from './Model/CoverageReport';
import { DiffChecker } from './DiffChecker';
import { Octokit } from '@octokit/core';
import { PaginateInterface } from '@octokit/plugin-paginate-rest';
import { RestEndpointMethods } from '@octokit/plugin-rest-endpoint-methods/dist-types/generated/method-types';

async function run(): Promise<void> {
  try {
    core.setFailed(JSON.stringify(core.getInput('delta')));
    return;
    const repoName = github.context.repo.repo;
    const repoOwner = github.context.repo.owner;
    const commitSha = github.context.sha;
    const githubToken = core.getInput('accessToken');
    const fullCoverage: boolean = JSON.parse(core.getInput('fullCoverageDiff'));
    const commandToRun = core.getInput('runCommand');
    const commandAfterSwitch = core.getInput('afterSwitchCommand');
    const delta: number | null = JSON.parse(core.getInput('delta'));
    const totalDelta: number | null = JSON.parse(core.getInput('totalDelta'));
    const githubClient = github.getOctokit(githubToken);
    const prNumber = core.getInput('prNumber');
    const branchNameBase = core.getInput('branchNameBase');
    const branchNameHead = core.getInput('branchNameHead');
    const coverageReportUrl = core.getInput('coverageReportUrl');
    const useSameComment: boolean = JSON.parse(core.getInput('useSameComment'));

    const commentIdentifier = `<!-- codeCoverageDiffComment -->`;
    let commentId = null;
    execSync(commandToRun);
    const codeCoverageNew = <CoverageReport>(
      JSON.parse(fs.readFileSync('coverage-summary.json').toString())
    );
    if (commandAfterSwitch) {
      execSync(commandAfterSwitch);
    }
    execSync(commandToRun);
    const codeCoverageOld = <CoverageReport>(
      JSON.parse(fs.readFileSync('coverage-summary.json').toString())
    );
    const currentDirectory = execSync('pwd')
      .toString()
      .trim();
    const diffChecker: DiffChecker = new DiffChecker(
      codeCoverageNew,
      codeCoverageOld
    );
    let messageToPost = `${commentIdentifier}For commit ${commitSha}

${
  coverageReportUrl
    ? `[Full coverage report download](${coverageReportUrl})`
    : `(Full coverage report URL not set)`
}

## Test coverage summary :test_tube:

`;
    const coverageDetails = diffChecker.getCoverageDetails(
      !fullCoverage,
      `${currentDirectory}/`
    );
    if (coverageDetails.length === 0) {
      messageToPost += 'No changes to code coverage.';
    } else {
      messageToPost +=
        'Status | File | % Stmts | % Branch | % Funcs | % Lines \n -----|-----|---------|----------|---------|------ \n';
      messageToPost += coverageDetails.join('\n');
    }
    if (useSameComment) {
      commentId = await findComment(
        githubClient,
        repoName,
        repoOwner,
        +prNumber,
        commentIdentifier
      );
    }
    await createOrUpdateComment(
      commentId,
      githubClient,
      repoOwner,
      repoName,
      messageToPost,
      +prNumber
    );

    diffChecker.checkIfTestCoverageFallsBelowDelta(delta, totalDelta);
  } catch (error) {
    core.setFailed(`${(<Error>error).stack}`);
  }
}

async function createOrUpdateComment(
  commentId: number | null,
  githubClient: { [x: string]: any } & { [x: string]: any } & Octokit &
    RestEndpointMethods & { paginate: PaginateInterface },
  repoOwner: string,
  repoName: string,
  messageToPost: string,
  prNumber: number
) {
  if (commentId) {
    await githubClient.issues.updateComment({
      owner: repoOwner,
      repo: repoName,
      comment_id: commentId,
      body: messageToPost
    });
  } else {
    await githubClient.issues.createComment({
      repo: repoName,
      owner: repoOwner,
      body: messageToPost,
      issue_number: prNumber
    });
  }
}

async function findComment(
  githubClient: { [x: string]: any } & { [x: string]: any } & Octokit &
    RestEndpointMethods & { paginate: PaginateInterface },
  repoName: string,
  repoOwner: string,
  prNumber: number,
  identifier: string
): Promise<number> {
  const comments = await githubClient.issues.listComments({
    owner: repoOwner,
    repo: repoName,
    issue_number: prNumber
  });

  for (const comment of comments.data) {
    if (comment.body?.startsWith(identifier)) {
      return comment.id;
    }
  }
  return 0;
}

run();
