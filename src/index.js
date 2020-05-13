const fs = require("fs");

function parseNumber(str) {
  const number = parseFloat(str);

  return isNaN(number) ? null : number;
}

async function* streamToLines(stream) {
  let data = "";
  for await (const chunk of stream) {
    data += chunk;
    let newLineIndex;
    while ((newLineIndex = data.indexOf("\n")) >= 0) {
      yield data.slice(0, newLineIndex);
      data = data.slice(newLineIndex + 1);
    }
  }
  if (data.length > 0) {
    yield parseInt(data);
  }
}

function parseSyscallName(testName) {
  const match = (testName || "").trim().match(/\d/);

  if (!match || !match.index) {
    return testName || "";
  }

  return testName.slice(0, match.index);
}

const TPASS = 0; /* Test passed flag */
const TFAIL = 1; /* Test failed flag */
const TBROK = 2; /* Test broken flag */
const TWARN = 4; /* Test warning flag */
const TINFO = 16; /* Test information flag */
const TCONF = 32; /* Test not appropriate for configuration flag */

function parseStatusFlags(exitStatus) {
  return {
    passed: exitStatus === 0,
    failed: (exitStatus & TFAIL) === TFAIL,
    broken: (exitStatus & TBROK) === TBROK,
    warning: (exitStatus & TWARN) === TWARN,
    info: (exitStatus & TINFO) === TINFO,
    notAppropriateConfig: (exitStatus & TCONF) === TCONF,
  };
}

function parseLine(line) {
  if ((line || "").startsWith("startup")) {
    return null;
  }

  const map = {};
  const keyValues = (line || "").trim().split(" ");

  for (const keyValue of keyValues) {
    const pair = keyValue.split("=");

    if (pair.length !== 2) {
      console.warn(
        "parseLine('",
        line,
        "'): failed to read key value '",
        keyValue,
        "'"
      );
      continue;
    }

    map[pair[0]] = pair[1].trim();
  }

  if (!map.tag) {
    console.warn("parseLine('", line, "'): failed to find tag");
    return null;
  }

  const exitStatus = parseNumber(map.stat);
  const testResult = {
    syscall: parseSyscallName(map.tag),
    test: map.tag,
    startTime: parseNumber(map.stime),
    duration: parseNumber(map.dur),
    testStopReason: map.exit,
    exitStatus,
    coreDumped: map.core.trim().toLowerCase() === "yes",
    cumulativeUserTime: parseNumber(map.cu),
    cumulativeSystemTime: parseNumber(map.cs),
    status: parseStatusFlags(exitStatus),
  };

  return testResult;
}

function aggregateTestResult(syscallMap, testResult) {
  if (!syscallMap || !testResult) {
    return false;
  }

  let syscall = syscallMap[testResult.syscall];
  if (!syscall) {
    syscall = {
      name: testResult.syscall,
      tests: [],
      statusCounters: {
        passed: 0,
        failed: 0,
        broken: 0,
        warning: 0,
        info: 0,
        notAppropriateConfig: 0,
      },
    };
    syscallMap[testResult.syscall] = syscall;
  }

  syscall.tests.push(testResult);
  syscall.statusCounters.passed += Number(testResult.status.passed);
  syscall.statusCounters.failed += Number(testResult.status.failed);
  syscall.statusCounters.broken += Number(testResult.status.broken);
  syscall.statusCounters.warning += Number(testResult.status.warning);
  syscall.statusCounters.info += Number(testResult.status.info);
  syscall.statusCounters.notAppropriateConfig += Number(
    testResult.status.notAppropriateConfig
  );

  return true;
}

async function parseSyscallTestResult(fileName) {
  const syscallMap = {};
  var stream = fs.createReadStream(fileName);

  for await (const line of streamToLines(stream)) {
    const testResult = parseLine(line);
    aggregateTestResult(syscallMap, testResult);
  }

  return syscallMap;
}

function printSyscall(syscall) {
  console.log(
    "    " +
      syscall.name.padEnd(25, " ") +
      "(Passed: " +
      String(syscall.statusCounters.passed).padStart(2, " ") +
      " Failed: " +
      String(syscall.statusCounters.failed).padStart(2, " ") +
      " Broken: " +
      String(syscall.statusCounters.broken).padStart(2, " ") +
      ")"
  );
}

async function main() {
  const logFilePath = process.env.LOG_FILE_PATH;

  if (!logFilePath) {
    throw new Error("LOG_FILE_PATH environment variable not defined");
  }

  const syscallMap = await parseSyscallTestResult(logFilePath);

  console.log("\n\n\n\n\n\nSyscalls test sumary:");
  console.log("");

  console.log("  Failed (never passed and failed at least once):");
  for (const syscall of Object.values(syscallMap)) {
    if (
      syscall.statusCounters.passed === 0 &&
      syscall.statusCounters.failed > 0
    ) {
      printSyscall(syscall);
    }
  }
  console.log("");

  console.log("  Not tested (did not pass or failed once):");
  for (const syscall of Object.values(syscallMap)) {
    if (
      syscall.statusCounters.passed === 0 &&
      syscall.statusCounters.failed === 0
    ) {
      printSyscall(syscall);
    }
  }
  console.log("");

  console.log("  Passed (at least once):");
  for (const syscall of Object.values(syscallMap)) {
    if (syscall.statusCounters.passed > 0) {
      printSyscall(syscall);
    }
  }
  console.log("");

  console.log("Total of syscalls tested:", Object.keys(syscallMap).length);
}

main().catch((ex) => console.error("main() error:", ex));
