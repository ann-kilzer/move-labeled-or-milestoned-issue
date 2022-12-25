const github = require("@actions/github");
const core = require("@actions/core");
const { graphql } = require("@octokit/graphql");

async function run() {
    const myToken = core.getInput("action-token");
    const projectUrl = core.getInput("project-url");
    const milestoneName = core.getInput("milestone-name");
    const context = github.context;

    if (!milestoneName) {
        throw new Error("milestone-name must be set");
    }

    let found = false;
    var baseObject;

    if (context.payload.issue) {
        baseObject = context.payload.issue;
    } else if (context.payload.pull_request) {
        baseObject = context.payload.pull_request;
    }

    if (baseObject && milestoneName) {
        if (baseObject.milestone && baseObject.milestone.title == milestoneName) {
            found = true;
        }
    }

    if (found) {
    // get the columnId for the project where the issue should be added/moved
        let projectV2ID = await getProjectV2ID(projectUrl, myToken);
        if (projectV2ID) {
            handleV2Card(baseObject, projectV2ID, myToken);
        } else {
            console.error("UNSUPPORTED");
        }
    } else {
    // Nothing matched what we are looking for, non-indicative of a failure though
        return `Issue/PR #${baseObject.id} was not found, ignoring`;
    }
}

async function handleV2Card(baseObject, projectID, token) {
    const result = moveItemToV2Project(projectID, baseObject.id, token);
    console.log(result);
}
async function getProjectV2ID(projectUrl, token) {
    // if org project, we need to extract the org name
    // if repo project, ???
    var splitUrl = projectUrl.split("/");
    var projectNumber = parseInt(splitUrl[6], 10);

    // check if repo or org project
    if (splitUrl[3] == "orgs") {
    // Org url will be in the format: https://github.com/orgs/github/projects/910
        var orgLogin = splitUrl[4];
        console.log(
            `This project is configured at the org level. Org Login:${orgLogin}, project number#${projectNumber}`
        );
        var projectInfo = await getProjectV2Info(orgLogin, projectNumber, token);
        console.log(projectInfo);
        return projectInfo.organization.projectV2.databaseId;
    }
    return null;
}

async function getProjectV2Info(organizationLogin, projectNumber, token) {
    // GraphQL query to get the ID and title for a projectV2
    // https://docs.github.com/en/graphql/overview/explorer is good to play around with
    const response = await graphql(
        `
      query($loginVariable: String!, $projectVariable: Int!) {
        organization(login: $loginVariable) {
          projectV2(number: $projectVariable) {
            databaseId
            title
          }
        }
      }
    `,
        {
            loginVariable: organizationLogin,
            projectVariable: projectNumber,
            headers: {
                authorization: `bearer ${token}`,
            },
        }
    );
    return response;
}

async function moveItemToV2Project(projectID, itemID, token) {
    const response = await graphql(
        `
      mutation AddToProject($projectID: ID!, $itemId: ID!) {
        addProjectV2ItemById(
          input: { projectId: $projectID, contentId: $itemId }
        ) {
          clientMutationId
        }
      }
    `,
        {
            projectID: projectID,
            itemID: itemID,
            headers: {
                authorization: `bearer ${token}`,
            },
        }
    );
    return response;
}

run().then(
    (response) => {
        console.log(`Finished running: ${response}`);
    },
    (error) => {
        console.log(`#ERROR# ${error}`);
        process.exit(1);
    }
);
