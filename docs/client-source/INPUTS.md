# Precision Health client source material (collected 7 Oct 2026)

Ground truth for the rebuild. When this file disagrees with `Precision_Health_Pulse_Implementation_Prompt.txt` or with the current code, this file wins. Every value here comes from material Precision Health sent on 2 Oct 2026, except where a line says "decision".

Original files (read them when you need exact wording):
- `/Users/macobrien/Downloads/Precision Health Screening Platform  Ten-Page Specification.pdf` (Neil: "AI generated but pretty close")
- `/Users/macobrien/Downloads/Precision Health Screening Platform  Full-Resolution Screenshots/S01..S12.png` + `README.md` (Neil: "probably needs a splash of colour")
- `/Users/macobrien/Downloads/Reporting Viewer.png` (the clinician's current result viewer)
- `/Users/macobrien/Downloads/Screening report Test.pdf` (17-page participant report as sent today); `pdftotext -layout` works on it
- Live forms: booking https://forms.precisionhealth.ie/262714997835979 ; nurse form https://forms.precisionhealth.ie/form/sisk-comprehensive-lab-screen-v2 (field lists below, captured 7 Oct)

## 1. Today's operation (how it actually runs)

1. Employer programme gets a Jotform booking page per clinic day, e.g. "Cardiac Health Screening, LinkedIn, 16th October 2026". Participant picks a date and a time slot (20-minute slots on that form, 09:20 to 16:40 with gaps), enters first name, last name, email, mobile (Irish format `08x1234567`, with "Non-Irish mobile" and "No Irish mobile" options), reads the consent form, ticks the boxes, signs, dates, submits.
2. Jotform sends a confirmation email "with instructions before attending".
3. On the day the nurse fills the nurse form (Section 3), prefilled from the booking where possible. The form is the clinical record.
4. Nurse escalations inside the form: "Approve? = No. Significantly abnormal results. Refer to doctor." and "Irregular ECG and Irregular Pulse: take photos of the ECG and send to the Slack channel."
5. Bloods go to Eurofins (Dublin). Results come back as CSV over FTP, held in Google Workspace, and staff match rows to people by the Unique ID (format `COMP02988`). The nurse form has hidden fields for every lab value plus a "Result" classification field per analyte.
6. QRISK3 score, QRISK3 heart age and relative risk are produced today (fields `QRISK3ScoreX`, `QRISK3HH_Agex`).
7. The clinician reviews in an Excel-style viewer (Reporting Viewer.png). The cells are colour-coded: green = normal, yellow = borderline, orange = abnormal or raised, grey = not tested or not applicable. The clinician writes the advice in a red "NEW ADVICE" box.
8. A PDF report is generated (headless Chrome) and emailed to the participant as an encrypted file. The access code goes by SMS through Esendex.
9. At the end of the programme, anonymised aggregate data goes to the employer.
10. Monday.com is used for business operations and nurse coordination (not the clinical record).

## 2. Booking form fields (LinkedIn cardiac, live)

- Venue; Appointment date and time (Europe/Dublin); First name*, Last name*, Email* (confirmation email), Mobile* (`08x1234567`, Non-Irish Mobile, No Irish Mobile)
- Consent form, "Please read this important information carefully":
  - General terms: screening is a snapshot of a limited range of measurements on a single occasion; it is not a substitute for your GP or specialist; take results to your GP or specialist before changing treatment; every test has a margin of error and abnormal results are generally repeated on a different day in a different setting; events outside Precision Health's control.
  - Data processing: data is encrypted in transit and at rest; stored in the EU; name, email and mobile are shared with Esendex only to send the report access code by text; the report is sent as an encrypted file by email; the report is held for 2 years (decision: show "retention period to confirm", do not hard-code 2 years); no sharing of identifiable data without consent except legal or Medical Council ethical requirement; anonymised aggregate data is shared with the employer at the end of the project; Precision Health is registered with the Data Protection Commissioner as a Data Controller.
  - Checkboxes* (all four required): "I have read and understood the information"; "I understand I may withdraw my consent any time before the appointment is booked"; "I understand I may NOT attend the appointment if I have fever or other symptoms suggestive of infection" (decision: keep their meaning, drop the word COVID-19); "I understand I may NOT attend if I have been advised to self-isolate or restrict my movements".
  - Signature* (with a screen-reader alternative: "I'm using a screen reader and can't complete the signature box"), Date*.
  - Contact: support@precisionhealth.ie.

Decision from the earlier call (Neil): consent and the pre-screening questionnaire must be completed BEFORE the booking is confirmed, because completion drops when it is left until afterwards.

## 3. Nurse form: "SISK Comprehensive (LAB) Screen V2" (exact fields, in order)

Registration
- Appointment date and time; First name*; Last name*; Email*; Mobile* (+ Non-Irish mobile); Email E (second email); Date of birth*; Sex at birth* (Male, Female)
- Company* (site picklist; Sisk sites include: SISK Adare Bypass, SISK Amgen, SISK Analog Devices, SISK Astellas, SISK AstraZeneca, SISK Center Parcs, SISK CityWest, SISK Cork Office, SISK DAA, SISK Galway Office, SISK Glass Bottle, SISK Grand Canal Quay, SISK Intel, SISK Janssen, SISK Limerick Office, SISK National Cricket Centre, SISK O'Devaney Gardens, SISK Project Opera, SISK Shanganagh WWTP, SISK Sligo, SISK Surgical Hub MPUH, SISK UCD Student Residences, SISK UHL Limerick, SISK Vantage, SISK VisionCare, SISK Europe sites, Farrans sites, "Other, if not listed please advise Brenda")
- Walk-in?* (No, Yes); Employer

Cardiovascular Risk Questionnaire (QRISK3 inputs)
- Ethnicity: White or not stated, Indian, Pakistani, Bangladeshi, Other Asian, Black African, Black Caribbean, Chinese, Other ethnic group
- Do you smoke*: No, Ex-smoker, 1-10 cigarettes per day, 11-20 cigarettes per day, more than 20 cigarettes per day. Note: "Vaping is not smoking." Smoking history (text)
- Medical conditions, each TRUE/FALSE*: Diabetes Type 2, Diabetes Type 1, Frequent migraine, Rheumatoid arthritis, Systemic lupus erythematosus, Chronic kidney disease, Chronic atrial fibrillation, Severe mental illness
- Medications, each TRUE/FALSE*: Treated hypertension, Atypical antipsychotic medication, Treatment for erectile dysfunction, Regular oral steroid medication
- Family history of stroke/MI under 60 years?* TRUE/FALSE
- Stroke or MI?* No/Yes, Age

Bowel Cancer Risk Questionnaire
- Bowel cancer screen in last 2 years? Yes/No; Blood in stool recently? Yes/No; Change in bowel habit lasting more than 1 month? Yes/No; Family history of bowel cancer (parent or sibling)? Yes/No
- Fit kit given?*: No, Recommended but declined, Yes
- Informed choice when no risk factors: "If you don't have any risks, a positive FIT result is more likely to be due to a benign reason (haemorrhoids, polyps, infection) than bowel cancer. To prove this you would need further testing (rectal examination, colonoscopy). Do you still want the FIT test?"

Prostate Specific Antigen Test (men over 45 only)
- Father or brother had prostate cancer under 60? Yes; Afro-Caribbean heritage? Yes; Symptoms of bladder outflow obstruction: Dribbling stream / Waking to urinate more than 3 times per night / Needing to go back to urinate again immediately after finishing
- PSA taken?: No, Offered but declined, Yes
- Informed choice when no risk factors and under 45: raised PSA more likely benign; further testing would be rectal exam, more PSA tests, MRI, possibly biopsy. "Do you still want the PSA test?"

Measurements
- Height*; Weight*; BMI (calculated); Waist circumference* (cm, e.g. 088); Muscular physique?* No/Yes
- Systolic BP*; Diastolic BP*; History of high BP?: Yes (white coat), Yes (on treatment), Yes, No
- Peak flow* (write 0 or Not Done if not part of screen)

ECG
- ECG*: Done, Not Done; Pulse rate* (from the ECG machine)
- ECG machine advice*: a Stable waveform (normal); B Fast heart rate; F Slow heart rate; H Slow heart rate and deviating waveform; J Irregular heart rate; K Irregular heart rate and deviating waveform; L Deviating waveform; M Analysis impossible; 12-Lead normal; 12-Lead borderline; 12-Lead abnormal; Other message (in the comment box)
- ECG comment (symptoms, cardiac history)*; Manual pulse*: Regular, Irregular, Other
- Rule: Irregular ECG and irregular pulse: take photos of the ECG and send to the clinical channel (Slack today)
- ECG time*; ECG machine*

Urinalysis
- Urinalysis*: Not done, Complete. Glucose*, Protein*, Blood*: Nil, +, ++, +++, Not done. WCC*: Nil, 10, 100, >100, Not done

Close-out
- Bloods taken?* Yes/No
- Approve?*: Yes; "No. Significantly abnormal results. Refer to doctor."
- Nurse comments* (problems with the screening, symptoms, relevant info for abnormal measurements)
- Medications* (write "nil" if no meds)
- Screening clinician* (picklist of nurses)
- Advice: "DON'T WRITE ANYTHING IN HERE, USE NURSE COMMENTS INSTEAD" (advice is the doctor's field)

Hidden lab fields on the same form (filled from Eurofins): QRISK3 score, QRISK3 heart age, Cholesterol total, HDL, LDL, Chol T:HDL ratio, Non-HDL, Triglycerides, HbA1c, Haemoglobin, White cell count, Platelets, Bilirubin total, Total protein, Alkaline phosphatase, Gamma GT, AST, ALT, Urea, Creatinine, Uric acid, Ferritin, PSA total, Free T4, TSH, Vitamin D, Iron, TIBC, Vitamin B12, Folic acid, Adjusted calcium, Magnesium, Phosphate, FIT, Alcohol units/week, Lifestyle questionnaire review. Each lab value has a paired "Result" classification field.

## 4. Clinician viewer (Reporting Viewer.png), exact layout

Three label/value column pairs, compact rows, colour-filled value cells:
- Col 1: FirstName, Age, Qrisk Heart Age, Qrisk score, Qrisk Rel Risk, Family History of CVD, Diabetes, Hypertension Treatment, Smoker, BP Systolic, BP Diastolic, BMI, Waist, Muscular/Fit, Bloods Taken?, Cholesterol total, Cholesterol HDL, Cholesterol Non-HDL, Cholesterol LDL, Triglycerides, Relevant History, Nurse Comments
- Col 2: LastName, Gender, PEFR, PEFR Result, HBA1c, Medical History, Smoking History, Medications, ECG, ECG Comments, Manual Pulse, Alcohol units, Urea, Creatinine, Menstruating?, Urine Glucose, Urine WCC, Urine RCC, Urine Protein, Unable to complete?, Menstruating, Medications
- Col 3: Unique ID (COMP02988), Date of Screen, Haemoglobin, White Cell Count, Platelets, Uric Acid, PSA, Free T4, TSH, Bilirubin, Protein, GGT, ALT, AST, Iron, Ferritin, TIBC, Cervical Smears, Breast Lumps, Testicular Lumps, PSA, FIT Result
- Bottom: red "NEW ADVICE" label with a wide advice text box.
- Example: Testy Test, 48, Male, Qrisk heart age 52, score 4.46%, rel risk 1.4 (yellow), BP 128/86 green, BMI 28.7 orange, TC 5.4 yellow, HDL 0.97 orange, Non-HDL 4.4 orange, LDL 3.4 green (inconsistent with the <3.0 limit), TG 3.48 orange, HbA1c 40 green, Urea 8.6 orange, Creatinine 96 green, PEFR 0 "REDUCED", Free T4 orange, PSA green. Advice: "...protective HDL is low and urea is mildly raised. Arrange a GP review to agree follow-up. Start regular physical activity, aim for gradual weight reduction, maintain normal hydration and reduce saturated fat and sugary foods. Blood sugar and creatinine are reassuring."

## 5. Participant report (Screening report Test.pdf, 17 pages), structure and ranges

Page 1: "Health Screening Report"; Appointment date; Name; Date of birth; intro (thanks; screening is a snapshot; take this report to your GP; false negatives exist, see your GP about symptoms; questions to support@precisionhealth.ie); **Advice** paragraph; "Advice provided by Dr. Neil Reddy (MCRN number)".
Page 2: Lifestyle Questionnaire intro + support links (quit.ie, drinkaware.ie, Irish Heart Foundation, Irish Cancer Society, employer EAP e.g. Sisk: TELUS Health EAP 1800 936 534, myhealth@sisk.ie) + answers table:
  How do you feel your health has changed in the past year?; Do you smoke cigarettes?; Do you use e-cigarettes (vaping)?; How often do you have an alcoholic drink?; How many units of alcohol do you drink on those days?; How often do you eat 5 or more portions of fruit or vegetables?; How often do you drink full sugar drinks eg Coke, 7-Up?; How often do you eat red meat?; How often do you add salt to your food?; How often do you drink the recommended daily amount of water?; How many days per week do you get 30 minutes of exercise?; I am aware of the mental health supports, resources and training that [employer] has to offer.; Do you pay attention to nutritional information on food labels?; Do you examine your testicles? (male) / breasts (female)
Each test page: "What is tested and why is it important?", "What are the limitations?", "What should I do about abnormal results?", a link line, then a table: Test | Your Result | flag word | Normal Range | Units.
- Cholesterol: Total <5.0, HDL >1.0, LDL <3.0, Non-HDL <3.8, Triglycerides <2.0 (mmol/L). Non-fasting TG may be falsely high.
- Blood pressure table: <120/80 Ideal; 120/80 to 140/90 Borderline; 140/90 to 160/100 Raised; 160/100 to 180/110 Significantly raised; >180/110 Immediate treatment. Flag word example "MILD" for 139/84.
- Cardiovascular risk: QRISK3 10-year risk, heart age ("less than your real age"), inputs table (BP, smoking, BMI, Total:HDL ratio <4:1, family history). Not calculated for under 26.
- HbA1c <48 normal; >42 higher risk (pre-diabetes); >48 may indicate diabetes. mmol/mol.
- BMI (19-25), Height (m), Weight (kg), Waist <80 cm female, <90 cm male. Flag "OVERWEIGHT".
- Kidney: Urea <8 mmol/L, Creatinine <106 umol/L, Uric acid 220-450 umol/L.
- Urinalysis: Blood, White cells, Glucose, Protein, normal Nil.
- Full blood count: Haemoglobin 13-17 (m) / 12-16 (f) g/dL; White cell count 3.5-10 x10^9/L; Platelets 150-410 x10^9/L.
- Liver: Bilirubin <24 umol/L; Total protein 60-83 g/L; Gamma-GT <55 U/L; AST <34 U/L; ALT <45 U/L.
- ECG: "Normal ECG".
- Thyroid: Free T4 9-19 pmol/L; TSH 0.35-4.94 mIU/L.
- Iron and ferritin: Iron 9.0-30.4 umol/L; Ferritin 15-200 (m) / 15-150 (f); TIBC 44-76 umol/L.
- Cancer screening: Bowel (FIT done?, FIT result), Prostate (PSA age bands: <50 years <2, 50-60 <3, 60-70 <4, >70 <5 ug/L; family history; symptoms; PSA taken; interpretation e.g. "Not Done"), Testicular (examine regularly? undiagnosed lumps now?) or Breast/Cervical for women.
- Known inconsistency in the sample: LDL 3.2 labelled NORMAL against "less than 3.0". Pulse must never do this.

## 6. Specification highlights (10 pages, v0.1)

Roles: super administrator (no automatic clinical access), administrator (programmes, invitations, bookings, attendance; no clinical answers), clinician (assigned episodes, review, release), participant (own released reports only), developer/support (synthetic only). Employer login not assumed in P0; Precision Health staff prepare approved aggregate exports.
Participant journey: invitation, verified account and MFA, eligibility, information and consent, questionnaire, slot selection, confirmation. Save and resume. "Not an urgent-care service" warning.
Booking: five-minute hold on a slot, one active booking per programme, reschedule reserves the new slot before releasing the old, confirmation by email and SMS, reminder 24 hours before, calendar (ICS) entry with no clinical detail.
Clinical capture: two-identifier check, auto-save with saving/saved/failed, missing vs not done vs declined vs not applicable, repeat measurement, specimen label and lab request preview, completion checklist; "appointment completed" is not "results received" or "report released".
Lab import: staging, checksum, column mapping, match on unique episode/specimen ID, cross-check DOB and name, quarantine conflicts, commit only accepted rows, no duplicates on re-upload.
Review: draft, awaiting results, ready for review, approved, released (+ on hold, follow-up, amended). "All normal: approve and release" per episode only, never bulk. Abnormal needs individual advice. Critical results start an escalation protocol that a notification cannot close.
Participant report: version, clinician, release date, values with units and limits, explanations, next steps (see own GP), PDF download, "not a diagnosis".
Programme reporting: invited, booked, attended, completed, released; age bands; sex as recorded; locations; suppression below 10 with complementary suppression; PDF and PowerPoint from the same snapshot; AI drafts optional and clinician-approved.
