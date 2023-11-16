import { green, italic, yellow } from "colors";
import { writeFile } from "fs/promises";
import { createObjectCsvWriter } from "csv-writer";
import { exportFilename, managementClient } from "./config";

const validationChecktimeMs: number = 3000;
const csvFilename = exportFilename + ".csv";
const jsonFilename = exportFilename + ".json";

interface IRecord {
  issue_type: string;
  element: string;
  item: string;
  language: string;
  message: string;
}

const run = async () => {
  console.log(green(`Starting app`));
  const environmentInfo = await managementClient
    .environmentInformation()
    .toPromise();

  console.log(
    `Starting validation for project '${yellow(
      environmentInfo.data.project.name
    )}' and environment '${yellow(environmentInfo.data.project.environment)}'`
  );
  const startValidationResponse = await managementClient
    .startEnvironmentValidation()
    .toPromise();

  let validationFinished: boolean = false;

  while (!validationFinished) {
    console.log(italic(`Waiting for validation to finish`));
    const checkValidationResponse = await managementClient
      .checkEnvironmentValidation()
      .byTaskId(startValidationResponse.data.id)
      .toPromise();

    if (checkValidationResponse.data.status === "failed") {
      throw Error(`Validation failed`);
    } else if (checkValidationResponse.data.status === "finished") {
      validationFinished = true;
    }

    await delayAsync(validationChecktimeMs);
  }

  console.log(`Validation response fetched`);

  const validationItems = (
    await managementClient
      .listEnvironmentValidationIssues()
      .byTaskId(startValidationResponse.data.id)
      .toAllPromise()
  ).data.items;

  if (validationItems.length === 0) {
    console.log(`${green("Success! No validation issues found")}`);
  } else {
    console.log(
      `Validation finished with '${yellow(
        validationItems.length.toString()
      )}' validation items`
    );

    const headers: { id: string; title: string }[] = [
      { id: "issue_type", title: "Issue type" },
      { id: "item", title: "Item" },
      { id: "language", title: "language" },
      { id: "element", title: "Element" },
      { id: "message", title: "Message" },
    ];

    const csvWriter = createObjectCsvWriter({
      path: csvFilename,
      alwaysQuote: true,
      header: headers,
    });

    const validationRecords: IRecord[] = [];

    for (const validationItem of validationItems) {
      for (const issue of validationItem.issues) {
        validationRecords.push({
          element: issue.element.codename,
          item: validationItem.item.codename,
          issue_type: validationItem.issue_type,
          language: validationItem.language.codename,
          message: issue.messages.join("& "),
        });
      }
    }

    await csvWriter.writeRecords(validationRecords);
    console.log(`File '${yellow(csvFilename)}' successfully created`);

    await writeFile(jsonFilename, JSON.stringify(validationRecords));
    console.log(`File '${yellow(jsonFilename)}' successfully created`);
  }
};

async function delayAsync(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

run();
