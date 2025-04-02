#!/usr/bin/env node

import { Command } from 'commander';
import { toZonedTime, format } from 'date-fns-tz';
import { parseISO, isValid } from 'date-fns';
import inquirer from 'inquirer';
import chalk from 'chalk';

const program = new Command();

// --- Configuration ---
const DEFAULT_TIMEZONES = {
    IST: 'Asia/Kolkata',
    EST: 'America/New_York',    // Eastern Time (most common representation)
    PST: 'America/Los_Angeles', // Pacific Time (most common representation)
    UTC: 'UTC',
    SGT: 'Asia/Singapore',
    JST: 'Asia/Tokyo',
    CST_US: 'America/Chicago',  // Central Time (US) - Be specific!
    // Add more defaults if needed
};

const PRETTY_FORMAT = 'yyyy-MM-dd HH:mm:ss zzzz'; // Example format

// --- Helper Functions ---

/**
 * Parses the input timestamp string. Expects ISO 8601 format with UTC 'Z'.
 * @param {string} timestampStr
 * @returns {Date | null} Parsed Date object or null if invalid.
 */
function parseInputTimestamp(timestampStr) {
    // Ensure it ends with 'Z' for UTC interpretation by parseISO
    if (!timestampStr || !timestampStr.endsWith('Z')) {
       console.error(chalk.red(`Error: Timestamp must be in ISO 8601 format and end with 'Z' for UTC (e.g., 2025-04-01T15:30:00Z)`));
       return null;
    }
    try {
        const parsedDate = parseISO(timestampStr);
        if (isValid(parsedDate)) {
            return parsedDate; // date-fns treats 'Z' as UTC correctly
        } else {
            console.error(chalk.red(`Error: Invalid date format: "${timestampStr}"`));
            return null;
        }
    } catch (error) {
        console.error(chalk.red(`Error parsing date: ${error.message}`));
        return null;
    }
}

/**
 * Gets a list of valid IANA time zone names.
 * @returns {string[]} Array of timezone names.
 */
function getAvailableTimezones() {
    try {
        // Modern Node versions support this Intl API
        if (typeof Intl.supportedValuesOf === 'function') {
            return Intl.supportedValuesOf('timeZone').sort();
        } else {
            // Fallback or older node versions - might need another library
            // For simplicity here, we'll rely on modern Node.js
             console.warn(chalk.yellow("Warning: Could not retrieve full timezone list. Using a basic set. Consider upgrading Node.js."));
             // Provide a smaller fallback list if needed
             return ['UTC', 'America/New_York', 'Europe/London', 'Asia/Tokyo', ...Object.values(DEFAULT_TIMEZONES)];
        }
    } catch (e) {
        console.error(chalk.red("Error retrieving timezone list: ", e));
        return Object.values(DEFAULT_TIMEZONES); // Fallback to defaults
    }
}

/**
 * Checks if a timezone string is a valid IANA name.
 * @param {string} tzString
 * @returns {boolean}
 */
function isValidIANATimezone(tzString) {
    try {
        // Attempting to use an invalid timezone throws an error
        new Intl.DateTimeFormat(undefined, { timeZone: tzString });
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * Maps common abbreviations (like IST) to IANA names. Case-insensitive.
 * Returns the original string if no mapping found.
 * @param {string} tzInput
 * @returns {string} IANA timezone name or original input.
 */
function mapAliasToIANA(tzInput) {
    const upperInput = tzInput?.toUpperCase();
    const aliasMap = {
        'IST': 'Asia/Kolkata',
        'EST': 'America/New_York',
        'EDT': 'America/New_York', // Map EDT to same IANA as EST
        'PST': 'America/Los_Angeles',
        'PDT': 'America/Los_Angeles', // Map PDT to same IANA as PST
        'CST': 'America/Chicago',   // Ambiguous! Defaulting to US Central
        'CDT': 'America/Chicago',   // Map CDT to same IANA as CST
        'SGT': 'Asia/Singapore',
        'JST': 'Asia/Tokyo',
        // Add other common ones if needed
    };
    return aliasMap[upperInput] || tzInput; // Return mapped or original
}


/**
 * Displays the given date in a specific target timezone.
 * @param {Date} dateObject The UTC date object.
 * @param {string} targetTimezone The IANA timezone name.
 */
function displayConvertedTime(dateObject, targetTimezone) {
    if (!isValidIANATimezone(targetTimezone)) {
         console.error(chalk.red(`Error: "${targetTimezone}" is not a recognized IANA time zone name.`));
         console.log(chalk.yellow(`Tip: Use standard names like 'America/New_York', 'Europe/Paris', 'Asia/Kolkata'.`));
         return;
    }
    try {
        const zonedTime = toZonedTime(dateObject, targetTimezone);
        const formattedTime = format(zonedTime, PRETTY_FORMAT, { timeZone: targetTimezone });
        console.log(` ${chalk.cyan(targetTimezone)}: ${chalk.green(formattedTime)}`);
    } catch (error) {
        console.error(chalk.red(`Error converting to timezone "${targetTimezone}": ${error.message}`));
    }
}

/**
 * Displays the given date in multiple timezones.
 * @param {Date} dateObject The UTC date object.
 * @param {Record<string, string>} timezones An object like { LABEL: IANA_NAME }.
 */
function displayTimeInMultipleTimezones(dateObject, timezones) {
    console.log(chalk.bold(`Time based on UTC: ${format(dateObject, PRETTY_FORMAT, { timeZone: 'UTC' })}`));
    console.log(chalk.bold('---------------------------------------'));
    for (const [label, ianaName] of Object.entries(timezones)) {
        displayConvertedTime(dateObject, ianaName);
    }
     console.log(chalk.bold('---------------------------------------'));
}

// --- CLI Setup ---

program
    .name('tzc')
    .description('A CLI tool to convert UTC timestamps to different timezones.')
    .version('1.0.0'); // Update version as needed

program
    .argument('[timestamp]', 'Timestamp in ISO 8601 UTC format (e.g., 2025-04-01T15:30:00Z)')
    .argument('[timezone]', 'Target timezone (e.g., America/New_York, IST, PST) or "default"')
    .action(async (timestampArg, timezoneArg) => {
        // Case 1: No arguments -> Show current time in default timezones
        if (!timestampArg) {
            console.log(chalk.yellow('No timestamp provided. Displaying current time in default zones:'));
            const now = new Date(); // Current time is inherently UTC-based internally
            displayTimeInMultipleTimezones(now, DEFAULT_TIMEZONES);
            return;
        }

        // We have at least a timestamp argument
        const inputDate = parseInputTimestamp(timestampArg);
        if (!inputDate) {
            process.exit(1); // Exit if timestamp parsing failed
        }

        // Case 2: Timestamp provided, but no timezone -> Interactive prompt
        if (timestampArg && !timezoneArg) {
            console.log(chalk.yellow('No timezone specified. Please select one:'));
            const allTimezones = getAvailableTimezones();
            if (!allTimezones || allTimezones.length === 0) {
                console.error(chalk.red('Could not retrieve timezone list. Cannot proceed interactively.'));
                process.exit(1);
            }

            try {
                const answers = await inquirer.prompt([
                    {
                        type: 'list', // Or 'rawlist' or 'autocomplete' (needs plugin)
                        name: 'selectedTimezone',
                        message: 'Select the target timezone:',
                        choices: allTimezones,
                        pageSize: 15, // Show more options at once
                    },
                ]);
                const selectedTz = answers.selectedTimezone;
                 console.log(`\nConverting ${chalk.blue(timestampArg)} to ${chalk.cyan(selectedTz)}:`);
                displayConvertedTime(inputDate, selectedTz);

            } catch (error) {
                 console.error(chalk.red('Error during interactive selection:'), error);
                 process.exit(1);
            }
            return;
        }

        // Case 3: Timestamp and "default" timezone
        if (timezoneArg && timezoneArg.toLowerCase() === 'default') {
            console.log(`\nConverting ${chalk.blue(timestampArg)} to default timezones:`);
            displayTimeInMultipleTimezones(inputDate, DEFAULT_TIMEZONES);
            return;
        }

        // Case 4: Timestamp and specific timezone provided
        if (timestampArg && timezoneArg) {
             console.log(`\nConverting ${chalk.blue(timestampArg)} to ${chalk.cyan(timezoneArg)}:`);
             const targetTz = mapAliasToIANA(timezoneArg); // Map alias if necessary
             displayConvertedTime(inputDate, targetTz);
             // If the mapped name is different from input, show a note
             if (targetTz !== timezoneArg && isValidIANATimezone(targetTz)) {
                 console.log(chalk.dim(`(Note: Used IANA zone "${targetTz}" for "${timezoneArg}")`));
             }
             return;
        }

        // Should not be reached, but show usage just in case
        program.help();

    });

// --- Run the CLI ---
program.parse(process.argv);
