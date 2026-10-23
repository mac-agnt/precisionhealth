# Screening reference ranges (Dr Neil Reddy, 23 Oct 2026)

Source: "Screening Reference Ranges: Developer Table", sent by Neil after the 23 October 2026 walkthrough call. Precision Health's live store today is an Excel sheet; other sheets, cells and formulas reference it.

## What Neil asked for

- A separate page for the ranges, either as plain-language descriptions per cohort or as numbers and descriptor words per test.
- Cohorts defined by sex, age and ethnicity.
- Only superadmins update the ranges.
- From the call: a clear audit trail of which range a result was judged against on its date (his haemoglobin example: 12 to 16 on 7 October, 12 to 15 from 8 October). Never a black box run by an agent.

## How it is built (Health Screening module)

- `src/ph/model/referenceRangesData.ts` encodes every row of the table. `asSent` keeps each cell exactly as received; `RR_QUESTIONS` lists every default applied where the table was blank, one-sex, missing a unit or had a gap.
- `src/ph/model/referenceRanges.ts`: cohorts (sex, age, ethnicity, pregnancy), bands with included or excluded limits, versions with effective dates, classification, gap and overlap detection, and the generated plain-language sentence.
- `src/ph/pages/Screening/`: Reference ranges, Check a result, Change control, Results impact, Calculations, Cohorts, To confirm.
- Every result is banded by the table: laboratory results, calculated values (non-HDL, total:HDL), BMI (ethnicity from the nurse form), waist, blood pressure and QRISK3. Each stored result records the range version it was judged against (`rangeVersion`), on its sample date. Publishing a new version re-bands unreleased results; released results keep their version.
- Mapping to the report's four colours: normal green; mildly abnormal yellow (borderline); significantly abnormal orange (abnormal); not set grey. Outside normal with no defined band: yellow and clinician review.
- Defaults applied until Precision Health confirms (also on the To confirm tab): one-sex normal ranges for LDL, non-HDL and HbA1c applied to both sexes; adjusted calcium uses the table's calcium range; total:HDL uses the sample report's less than 4:1; haemoglobin's 15 to 65 and non-pregnant note read as describing the WHO severity bands; blood pressure 121 to 140 / 81 to 90 shown green MILD as in the sample report; relative risk unbanded and QRISK3 10% or more flagged.
- The workbook formulas for adjusted calcium, globulin and UIBC have not been received; adjusted calcium is the laboratory's value, and globulin and UIBC are not in the demo panel.
- Rounding: half away from zero at the reported decimal places (1.005 to 2 places is 1.01).

## Problems found in the table by the automatic check

- Blood pressure: systolic 121 to 140 and diastolic 81 to 90 fall in no band; the mild diastolic cell reads "≤90".
- LDL 3.0, non-HDL 4.0 and HDL 1.00 exactly fall in no band (normal and abnormal both exclude the limit).
- Triglycerides 1.70 is in both normal and mildly abnormal.
- TSH: 0.100 to 0.349 and 4.941 to 9.999 have no band (mild is blank).
