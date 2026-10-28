# Getting started

## What the KMCC app is
The KMCC Jeddah Neerad app keeps the savings and loan scheme's records: members, monthly savings, deposits and withdrawals, loans and repayments, profit, interest, zakat, expenses and the bank accounts. The admin enters and corrects the records. Each member sees their own savings, monthly dues, loan and transactions.

## Logging in
Open the app and type your Mobile Number or your Member ID (like KMCC0012), then your password, and tap Login. If more than one member has the same mobile number, the app asks for the Member ID instead - log in with your Member ID.
After logging in, the admin lands on the Dashboard and a member on My Profile.
To log out, tap Logout at the top right (on a phone it is the button with the door icon).

## Forgot your password
There is no reset link in the app. Ask the KMCC admin: they set a new password for you (Members > the edit button next to your name > Password). Then log in and change it to your own in Settings > Change Password.

# Where things are

## The menu
The admin's menu: Dashboard, Members, Banks, Transactions, Member Profile, Assistant, Settings.
A member's menu: My Profile, Assistant, Settings.
On a computer the menu is on the left. On a phone tap the small button at the top left to open the menu; tap outside it to close it.
The round Assistant button at the bottom right opens the Assistant on every page.
Your name and Member ID are at the top of every page.

# Dashboard
Roles: admin

## The dashboard tiles
Dashboard shows the scheme's totals: Total Members, Total Savings Amount, Total Loan Amount, Total Bank Balance, Total Profit, Total Interest Amount, Total Expense, Total Zakat, Total Inflow (All) and Total Outflow (All). Amounts are in rupees (₹).
Total Savings Amount is the members' savings: their saving deposits minus savings withdrawals.
Total Loan Amount is what is still owed on the active loans.
Total Bank Balance is every bank's opening balance plus its deposits minus its withdrawals.
Total Interest Amount and Total Zakat are net: money in minus money out for that category.
Total Inflow (All) and Total Outflow (All) add up every deposit and every withdrawal, of every category.

## Open the details behind a tile
A tile with a coloured top line and a small chart icon opens its details. Tap it:
Total Members shows saving and loan members - tap a row to see those members.
Total Bank Balance shows each bank's balance - tap a bank to see its transactions on the Banks page.
Total Inflow (All) and Total Outflow (All) show the amount per category - tap a category to see those transactions.
Savings, Loan, Profit, Interest, Expense and Zakat open the Transactions page filtered to that category.

# Members
Roles: admin

## Add a member
Go to Members > Add Member. Fill in Name, Mobile Number, Address (optional), Password, Join Date and Member Type (Saving Member or Loan Member). A saving member also needs the Monthly Savings Amount for this year. Tap OK.
The app gives the new member the next Member ID (KMCC0001, KMCC0002 ...). Give the member their Member ID and password so they can log in.

## Saving members and loan members
A member is either a Saving Member or a Loan Member, not both. A saving member has a monthly savings amount and a contribution schedule on their profile. A loan member has the Loan Details section on their profile.

## Edit a member or change the monthly amount
Go to Members and tap the edit (pencil) button next to the member. You can change the name, mobile number, address, join date and member type, and set a new password (leave Password blank to keep the old one).
Monthly Savings Amount sets the amount for this year. Months already paid or part paid keep their old amount; only this year's months still pending use the new amount.

## Remove a member
Go to Members and tap the red delete button next to the member, then confirm. The member no longer shows in the list and cannot log in, but their transactions stay in the records.

## Find saving or loan members
Dashboard > Total Members > tap Saving Members or Loan Members. The Members page then shows only that type; tap the x on the "Filtered by" tag to see everyone again.

# Profile and statement

## My Profile
My Profile shows your name, Member ID, mobile number, address and member type, your monthly savings amount (Scheme ₹...) and your Balance.
Balance is all your credits minus all your debits: savings deposits and profit add to it, withdrawals and loans taken take away from it.
The ring at the top right shows how many of this year's 12 months are paid.
A member sees only their own profile. To change your mobile number or address, use Settings > Contact Details.

## Contribution schedule
A saving member's profile has this year's Contribution Schedule: each month with the amount paid and its status - PAID (green), PARTIAL (orange, part paid) or PENDING (red, not paid).
A savings deposit pays the oldest unpaid months of the deposit's own year first, so one payment can clear several months. A deposit never pays months of another year.
"Monthly savings amount not set" means the admin has not set this year's amount for the member yet (Members > edit > Monthly Savings Amount).

## Loan details
A loan member's profile shows each loan with its principal, the balance still owed, its status (ACTIVE or CLOSED) and the loan's transactions.

## Transactions on the profile
The Transactions table lists every entry for the member with the date, Deposit or Withdrawal, category, amount and description.

## Download your statement (PDF)
On the profile, tap the small download button next to the Member ID. The app makes a PDF statement of the member's transactions.

## See another member's profile
Roles: admin
Go to Member Profile and pick the member in the box at the top (type a name or Member ID to search).

# Transactions
Roles: admin

## Add a transaction
Go to Transactions > Add Transaction. Choose the Flow (Deposit or Withdrawal), then the Category, the Member, the Bank, the Amount, the Date and a Description, and tap OK.
Deposit categories: Saving, Interest, Loan (a repayment), Profit, Zakat.
Withdrawal categories: Loan (a new loan or more loan), Savings Withdrawal, Interest, Expense, Zakat.
A member is needed for Saving, Savings Withdrawal and Loan; for the others it is optional (for example a general expense).
The bank is optional for now, so old entries can be added without one. A deposit without a bank does not change any bank's balance - add the matching entry on the Banks page when you know which account it went to.

## Record a member's monthly savings
Transactions > Add Transaction > Flow Deposit > Category Saving > pick the member > amount, date, description > OK. The payment fills the member's oldest unpaid months of that year on their contribution schedule.

## Give a loan
Transactions > Add Transaction > Flow Withdrawal > Category Loan > pick the member > amount and date > OK. If the member already has an active loan, the amount is added to that loan; otherwise a new loan starts. A member has at most one active loan.

## Record a loan repayment
Transactions > Add Transaction > Flow Deposit > Category Loan > pick the member > pick the Loan > amount and date > OK. The loan's balance goes down; when it reaches zero the loan is CLOSED.

## Pay out a member's savings
Transactions > Add Transaction > Flow Withdrawal > Category Savings Withdrawal > pick the member > amount and date > OK. It lowers the member's balance; it does not change which months are paid.

## Distribute profit
Transactions > Distribute Profit. Type the Total Profit Amount, pick the Bank, the Date and a Description, and tap OK. The amount is split across all active saving members by each member's total savings so far, and each member gets their own Profit entry.

## Edit or delete transactions
Tap the edit (pencil) button on a transaction to change it, or the red delete button to remove it. To delete several, tick them and tap Delete Selected.
Changing or deleting a saving deposit works out the member's paid months again. Changing or deleting a loan entry works out the loan's balance again.

## Find transactions
Filter the list by Flow, Member, Category (several at once) and a date range at the top of Transactions. The filters stay in the page's address, so you can go back to them.

## Export and import a CSV file
Export CSV downloads the transactions in the list as a file (Date, MemberCode, MemberName, BankName, Flow, Category, Amount, Description, LoanId).
Import CSV takes a file with the same columns. Dates can be YYYY-MM-DD or DD/MM/YYYY. You first see a preview: rows with errors are skipped, and if a member has more than one active loan you pick the loan for that row. Nothing is saved until you tap Confirm Import.

# Banks
Roles: admin

## Add or edit a bank account
Go to Banks > Add Bank. Fill in the Bank Name and the account details (account holder, account number, branch, IFSC, MICR, SWIFT, currency, nomination) and the Opening Balance as per the bank statement when you first add the bank. Tap OK.
Tap the arrow at the start of a bank's row to see all its details. The pencil button edits a bank; the red button removes it.

## Add a bank entry
Banks > Add Entry records an entry straight on a bank account (the bank is required here), for example a savings deposit that was entered without a bank, interest, profit, an expense or zakat. There is no member on this form; loans and savings withdrawals are entered on the Transactions page.

## A bank's transactions
The Transactions list under the banks shows bank entries. Pick a bank in "Filter by bank" to see only that bank (Dashboard > Total Bank Balance > a bank opens the same view). You can edit, delete or tick and delete entries here too.

## Import bank entries from a CSV file
Banks > Import CSV. Columns: Date, BankName (needed on every row), Flow, Category (Saving, Interest, Profit, Expense or Zakat only), Amount, Description. A MemberCode column is ignored here. Check the preview and tap Confirm Import.

# Settings

## Dark theme
Settings > Appearance > Dark theme.

## Change your mobile number or address
Settings > Contact Details: change the Mobile Number or Address and tap Save Contact Details. Your new mobile number is also the one you log in with.

## Change your password
Settings > Change Password: type your current password, the new one (at least 6 characters) twice, and tap Change Password.

## Assistant daily limits
Roles: admin
Settings > Assistant sets how many questions each member, and the admin, may ask the Assistant per day (in the app and on Telegram together). 0 means no limit. Tap Save; it applies from the next question.

# The Assistant

## What the Assistant does
The Assistant answers questions about the KMCC records, in Malayalam, English or another language. A member asks about their own savings balance, unpaid months, last year's dues, payments and loan. The admin can also ask about any member and the whole scheme: who has pending dues, who has a loan, bank balances, money in and out by month.
It only reads the records - it cannot add or change anything. Check important figures on the Profile or Dashboard.

## Ask a question
Open Assistant from the menu, or tap the round Assistant button at the bottom right. Type your question, or tap one of the ready questions. Your recent questions are shown too, so you can ask them again with one tap.
Ask for a table or a chart (for example "show it as a bar chart") and the answer comes as one.

## Speak your question
Tap the microphone, speak, then tap the tick when you are done (the x cancels). Choose your language next to Voice under the box. With Auto-send on, the question is sent as soon as it is turned into text; with it off you can check and change the text first.

## Questions left today
The number at the top of the Assistant is how many questions you have left today. When it reaches zero, ask again tomorrow.

## Copy, save or print an answer
Under an answer: Copy copies the text (tables paste into a spreadsheet), Save as image saves a picture of the answer, and Print prints just that answer.

## Start a new chat
Tap the clear button at the top of the Assistant and confirm. The Assistant then forgets the earlier questions.

## Ask a person
When the Assistant cannot find the answer in the KMCC records, tap Ask a person under its answer. Check the question, add a note if you like, then tap Send. Sino reads your question and this chat and replies in the Assistant.
To ask Sino something directly: Assistant > the headset button at the top > Ask Sino a new question.
A new reply shows as a count on the round Assistant button and comes into the chat. The headset button lists everything you sent, with its status - Waiting, Answered or Closed. Open one to read the whole conversation and write back.

# Telegram

## Ask the Assistant on Telegram
The same Assistant answers on Telegram, with the same daily limit. Your Telegram account has to be linked to your member record first; an account that is not linked gets no answers.
Link it: Settings > Telegram > Link my Telegram > Open Telegram, then press Start. The link works once, within 10 minutes.
Or open the KMCC bot in Telegram and share your phone number when it asks - it must be the mobile number on your member record.
Voice messages work too.

## Ask a person on Telegram
After an answer that did not help, send /person in the bot (you can add a note after it: /person I cannot find my 2023 profit). Sino's reply comes in the bot and in the app's Assistant. To write back: /reply and your message.

## Unlink Telegram
Settings > Telegram > the red unlink button next to the account, then Unlink. The bot no longer answers that account.

## Set up the bot
Roles: admin
Settings > Telegram shows whether the bot is connected and how many accounts are linked. If it says Telegram does not send the messages here, tap Connect the bot. Tap it again after an update to show new commands, such as /person, in the bot's menu.
