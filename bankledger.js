/* Finance data has been REMOVED from this public file for security.
   It now loads at runtime from the locked Firebase /finance node — only the
   6 signed-in team accounts can read it (see fvFinanceLoad in index.html).
   These empty stubs just keep the app from erroring before that load.
   Full data backup: Drive -> Invoice/Bank Statements/_finance (import to Firebase).json */
var CAP_SHARE     = 25000;
var CAP_PARTIES   = [];
var CONTRIBUTIONS = [];
var CONTRIB_ADJ   = [];
var STMT_EXPENSES = [];
var BANK_TX       = [];
