/* Participant report text, following Precision Health's sample "Health Screening Report"
   (Screening report Test.pdf). Wording stays close to the client's own copy, with spelling tidied.
   Sections marked drafted have no client text in the sample and need Precision Health's approval.
   The advice signature uses a placeholder registration number: never a real one. */
import type { ProgrammeId } from "./types";

export const REPORT_TITLE = "Health Screening Report";
export const REPORT_HEADINGS = {
  what: "What is tested and why is it important?",
  limitations: "What are the limitations?",
  normal: "What is a normal result?",
  abnormal: "What should I do about abnormal results?",
};
export const ADVICE_HEADING = "Advice";
/** Placeholder registration number. The real MCRN is added only from Precision Health's own records. */
export const ADVICE_SIGNATURE = "Advice provided by Dr Neil Reddy (MCRN demo-0000)";
export const NOT_A_DIAGNOSIS = "This report is a screening snapshot, not a diagnosis. Take it to your own GP or specialist, who can add it to your full medical record.";

/** Page 1, after the name and dates and before the advice. */
export const REPORT_INTRO: string[] = [
  "Thank you for attending for health screening with us. We hope you found the experience enjoyable and had enough time to ask questions of our nurse. Below is a breakdown of your results, with advice regarding interpretation.",
  "Health screening is just a snapshot of your health on a particular date. We recommend that you consider these results in the context of your ongoing medical treatment and that you only make significant changes to your treatment, diet or exercise regimen after consultation with your GP or Specialist. Take this report to your GP or Specialist so they can add it to your full medical record.",
  "Every screening test has a chance of giving a false negative result, that is, the test was negative but you do actually have the condition. If you notice any unexplained symptoms (eg pain) or signs (eg a lump), despite a normal result on this screening assessment, you should arrange a consultation with your GP straight away. For further information on the conditions assessed in this report, see the reference materials on the specific pages.",
  "If you have any questions about the test results contained in this report or about the manner in which the tests or report were generated, please contact Precision Health on support@precisionhealth.ie.",
];

/** Page 2: the Lifestyle Questionnaire introduction and support links. */
export const LIFESTYLE_TITLE = "Lifestyle Questionnaire";
export const LIFESTYLE_INTRO: string[] = [
  "The Lifestyle Questionnaire asks you about habits that may affect your long-term health. The harmful effects of most 'bad' habits depend on how often you do them. The more you engage in a 'good habit', the more you benefit. Your answers help inform the advice in this report and are your baseline for future health changes.",
];
export interface SupportLink { topic: string; text: string }
export const LIFESTYLE_SUPPORT: SupportLink[] = [
  { topic: "Smoking", text: "For advice and support when you try to quit cigarette smoking or e-cigarette use (vaping), visit www.quit.ie." },
  { topic: "Alcohol", text: "The recommended maximum is 17 units a week (men) or 11 units a week (women). For advice and support, visit www.drinkaware.ie." },
  { topic: "Exercise, Diet and BMI", text: "For advice on reducing weight by eating sensibly and exercising safely, visit the Irish Heart Foundation." },
  { topic: "Cancer", text: "For advice on ways to reduce your risk of cancer and when to examine yourself or take part in a national screening programme, see the Irish Cancer Society's advice on Bowel Cancer, Breast Cancer, Cervical Cancer, Testicular Cancer and Prostate Cancer." },
];
/** Employer-specific mental health and support line. Only Sisk's comes from the client's sample report. */
export const EMPLOYER_SUPPORT: Record<ProgrammeId, SupportLink[]> = {
  "PRG-SISK-26": [
    { topic: "Mental Health", text: "TELUS Health EAP for short-term, solution-focused mental health support. This is a free and confidential service for all employees of Sisk. Please contact TELUS Health on 1800 936 534. Local and national mental health resources are in our Ireland Mental Health Supports Guide." },
    { topic: "Further support", text: "For further information and guidance, employees should also look to seek support from their GP. For further information please contact myhealth@sisk.ie." },
  ],
  "PRG-SF-26": [{ topic: "Mental Health", text: "Your employer's employee assistance programme offers free and confidential support. Contact details to be confirmed with Salesforce. You can also seek support from your GP." }],
  "PRG-IBM-26": [{ topic: "Mental Health", text: "Your employer's employee assistance programme offers free and confidential support. Contact details to be confirmed with IBM. You can also seek support from your GP." }],
};

export type ReportSectionKey =
  | "cholesterol" | "blood_pressure" | "cardiovascular_risk" | "hba1c" | "bmi" | "kidney" | "urinalysis" | "fbc" | "liver" | "ecg" | "thyroid"
  | "iron" | "vitamins_minerals" | "cancer" | "bowel" | "prostate" | "testicular" | "breast_cervical";
/** Empty lists mean the sample report has no text under that heading: leave the heading out. */
export interface ReportSectionContent {
  key: ReportSectionKey;
  title: string;
  what: string[];
  limitations: string[];
  /** Only the cardiovascular risk page has this heading. */
  normal?: string[];
  abnormal: string[];
  /** The "find out more" line under the text, or empty. */
  link: string;
  /** True when the sample report has no text for this section: drafted for Precision Health to approve. */
  drafted: boolean;
}

export const REPORT_SECTIONS: Record<ReportSectionKey, ReportSectionContent> = {
  cholesterol: {
    key: "cholesterol", title: "Cholesterol", drafted: false,
    what: ["Cholesterol is an essential part of your body. Results are divided into Total Cholesterol, HDL (\"Good\") Cholesterol, LDL (\"Bad\") Cholesterol and Triglycerides. High levels of cholesterol have been associated with an increased risk of cardiovascular disease, especially LDL Cholesterol and Triglycerides (Non-HDL Cholesterol). Low levels of HDL Cholesterol also carry an increased cardiovascular risk."],
    limitations: ["A non-fasting Triglyceride test may be falsely raised by recent food or alcohol and would need to be retested as a fasting sample. The other cholesterol components are routinely tested non-fasting."],
    abnormal: ["Management of a raised cholesterol depends on your other risk factors for cardiovascular disease (smoking, excess weight, diabetes, family history). A cholesterol-lowering diet is low in saturated and trans-fats from sources such as red meat, dairy and processed foods. Your GP may advise a cholesterol-lowering medication if diet alone does not address your raised levels."],
    link: "See our 2-minute video or visit www.irishheart.ie for more information.",
  },
  blood_pressure: {
    key: "blood_pressure", title: "Blood Pressure", drafted: false,
    what: ["A cuff is inflated around your arm to measure the pressure of blood within your artery. The larger value is called systolic and the smaller value is called diastolic. Consistently high blood pressure (hypertension) is a risk factor for cardiovascular disease."],
    limitations: ["Blood pressure readings should be taken on more than one occasion to diagnose hypertension. This can be done by your GP or with a home blood pressure monitor. A raised blood pressure may also be due to \"white coat syndrome\", where your blood pressure rises because of the stress of having it checked by a doctor or nurse."],
    abnormal: ["Raised blood pressure should be followed up with a recheck within 1 month at your GP. Your GP will then advise on further investigation and how often to monitor it. Addressing hypertension involves eating a low-salt diet, getting regular exercise and building your resilience to stress."],
    link: "See our 2-minute video or visit www.irishheart.ie for more details.",
  },
  cardiovascular_risk: {
    key: "cardiovascular_risk", title: "Cardiovascular Risk", drafted: false,
    what: ["Your cardiovascular risk is a measure of how likely you are to have a cardiovascular event (heart attack or stroke) within the next 10 years. The risk factors taken into account include smoking, high blood pressure, cholesterol, age, gender and family history. Knowing you have a higher than average risk of cardiovascular disease allows you to address your own risk factors and measure the difference it makes to your health."],
    limitations: ["Cardiovascular risk naturally increases with age. Some risk factors (gender, family history and age) cannot be changed. Cardiovascular risk scores are not calculated for younger adults because of insufficient data and accuracy. Risk factors have more or less significant effects in different ethnic groups. The risk score is calculated using QRISK3, which is most applicable to people in the UK and Ireland."],
    normal: ["Your cardiovascular risk score is converted to a \"Heart Age\": your real age adjusted by the relative risk you have compared with another person of the same age and gender but without your risk factors. If your heart age is higher than your real age, you have increased risk."],
    abnormal: ["Reducing your risk involves addressing your own risk factors. Stopping cigarette smoking is the single most effective way of reducing your cardiovascular risk, by roughly 30% to 50% for most people. See your results pages on Blood Pressure and Cholesterol for more on reducing these risk factors."],
    link: "Watch our 2-minute video on the QRISK score for more information.",
  },
  hba1c: {
    key: "hba1c", title: "HbA1c (Blood Sugar)", drafted: false,
    what: ["Haemoglobin A1c (HbA1c) is an indirect test of glucose levels in your blood over the past 2 to 3 months. A larger percentage of your haemoglobin is bound to glucose when glucose levels are high. HbA1c levels of 48 or above indicate you may have diabetes. Levels above 42 indicate you are at higher risk of developing diabetes (pre-diabetes)."],
    limitations: ["This test may be inaccurate in people of south-Asian origin or in those who have genetically abnormal haemoglobin (haemoglobinopathies or thalassaemia)."],
    abnormal: ["Your GP will generally repeat the test to confirm a diagnosis of diabetes or pre-diabetes. Management involves reducing your BMI to 25 (if it is higher), getting regular exercise and eating a diet low in processed sugars. If your levels remain high, your GP may prescribe medication."],
    link: "See our 2-minute video or visit www.diabetes.ie for more information.",
  },
  bmi: {
    key: "bmi", title: "Body Mass Index (BMI) and Waist", drafted: false,
    what: ["BMI is a measure of how proportionate your weight is to your height: BMI = Weight (kg) / (Height x Height (m)). A high BMI increases your risk of cardiovascular disease because it generally means you are carrying excess fat, especially around the midsection (waistline)."],
    limitations: ["If you carry extra weight for other reasons, your BMI will be falsely raised, for example muscle bulk, pregnancy or fluid. A raised BMI without a corresponding rise in waist circumference does not carry an increased cardiovascular risk, especially if excess fat is not the reason for the raised BMI."],
    abnormal: [
      "The normal range for BMI is 18 to 25. Below 18 you would be considered underweight, above 25 overweight and above 30 obese. Overweight and obese carry an increased risk of cardiovascular disease. If your increased BMI is due to excess fat, you need to lose weight to reduce it.",
      "Take any opportunity for extra exercise. Build a habit of moderate exercise (eg a brisk walk) for 30 minutes, 3 times per week. Take the stairs rather than the lift.",
      "Pay attention to the calorie content of your diet, using food labels or calorie estimator websites for home cooked food. Then reduce your total by choosing lower-calorie options or smaller portions. A steady calorie-reducing diet and exercise habit tends to be more successful than crash diets.",
    ],
    link: "See www.irishheart.ie for more information.",
  },
  kidney: {
    key: "kidney", title: "Kidney Function", drafted: false,
    what: ["Blood concentration of urea and creatinine, normal by-products of metabolism. A raised level of urea and/or creatinine may indicate impaired kidney function. A raised level of uric acid may predispose to gout and may be found with hypertension and with some medications."],
    limitations: ["Urea levels may also be raised when you are dehydrated. Creatinine levels are commonly raised after vigorous exercise, taking protein or creatine supplements, or eating a high protein diet with large amounts of red meat."],
    abnormal: ["Abnormal urea, creatinine and uric acid results should be retested and investigated by your GP. Make sure you are well hydrated and have avoided vigorous exercise before re-testing. Your GP will also ask about medical problems that may affect kidney function and will do a physical examination."],
    link: "",
  },
  urinalysis: {
    key: "urinalysis", title: "Urinalysis", drafted: false,
    what: ["Urinalysis is a test of the cells and chemicals in your urine sample. White cells, glucose, blood or protein in your urine may indicate problems in your kidneys or bladder: blood (infection, kidney stones, kidney inflammation, rarely cancer), white cells (infection), glucose (diabetes), protein (kidney inflammation)."],
    limitations: ["Blood in the urine is common during menstruation."],
    abnormal: ["Although most causes of these findings are benign, any unexplained abnormality in a urinalysis test should prompt a visit to your GP for a full history, a physical examination and a recheck."],
    link: "",
  },
  fbc: {
    key: "fbc", title: "Full Blood Count", drafted: false,
    what: [
      "The Full Blood Count measures the components of your blood. There are 3 important components.",
      "Haemoglobin is the protein in red blood cells that carries oxygen around your body. Low haemoglobin can indicate insufficient iron or loss of iron through menstrual or stomach blood loss; there are other, less common, causes. High levels may be found in some chronic diseases.",
      "White blood cells form an important part of your immune system. Low levels may increase your risk of infection. High levels may indicate active infection or inflammation.",
      "Platelets help your blood to clot. Low levels increase your risk of bleeding or bruising. High levels may occur during inflammation or infection.",
    ],
    limitations: ["The levels of the components of your blood vary in response to infection or inflammation and usually return to normal when that process is over."],
    abnormal: ["A repeat Full Blood Count is warranted for most abnormalities, usually in 2 to 3 months. If a level is very abnormal (eg very low white cells), the repeat sample should be done urgently. Our doctor will specify the appropriate follow-up in your advice section."],
    link: "",
  },
  liver: {
    key: "liver", title: "Liver Function", drafted: false,
    what: ["Your liver has many important functions which can be affected by lifestyle factors (eg alcohol, obesity) and by disease in other body systems (eg the digestive system, infection). Liver function tests measure liver enzymes, proteins and by-products of metabolism in your blood. Raised levels indicate that the liver is working hard to process or remove toxins from your body."],
    limitations: ["Liver function results vary in response to toxins (eg alcohol), infection or inflammation and usually return to normal when that process is over."],
    abnormal: ["A repeat liver function test is warranted for most abnormalities, usually in 2 to 3 months. In the meantime, look at your lifestyle for possible sources of toxins (especially alcohol and medications) and infections (eg recent travel)."],
    link: "",
  },
  ecg: {
    key: "ecg", title: "ECG", drafted: false,
    what: ["An ECG is a recording of the electrical activity of your heart, picked up by electrodes placed at standard points on your chest. It shows the electrical rhythm of the heart, how the electricity is conducted through the heart and how the different parts of the heart react to it. An ECG can pick up abnormal heart rhythms, such as atrial fibrillation (a major cause of stroke)."],
    limitations: ["The ECG records only about 30 seconds of your heart's activity, so an intermittent rhythm problem may be missed. Not all heart problems cause changes that an ECG can pick up; some need other tests such as an echocardiogram or a coronary angiogram."],
    abnormal: ["Many ECG abnormalities are benign and cause no symptoms or long-term problems. If further testing or a visit to a cardiologist is needed, our doctor will explain the steps in your advice section."],
    link: "",
  },
  thyroid: {
    key: "thyroid", title: "Thyroid Function", drafted: false,
    what: [
      "The thyroid gland controls your basal metabolic rate, the rate at which your body uses energy at rest. When thyroid hormone levels are too low, you may feel tired, constipated and gain weight. When they are too high, you may feel anxious, notice a rapid heartbeat (palpitations) and lose weight.",
      "Thyroid function is assessed by measuring Free T4, the active form of thyroid hormone, and thyroid-stimulating hormone (TSH), which your body uses to stimulate the thyroid gland to make more Free T4.",
    ],
    limitations: ["Abnormal thyroid hormone levels should always be interpreted together with symptoms and an examination of the thyroid gland in the neck."],
    abnormal: ["Consult your GP for a full history and examination. If your symptoms match the results, your GP may suggest thyroid hormone replacement (low results) or referral to an endocrinologist for further investigation (high results)."],
    link: "",
  },
  iron: {
    key: "iron", title: "Iron and Ferritin", drafted: false,
    what: [
      "Iron is mainly used to make haemoglobin, the oxygen-carrying part of blood. A lack of iron can reduce haemoglobin, causing tiredness and shortness of breath. Ferritin is the body's storage and transport protein for iron.",
      "Low iron and ferritin need investigation of the cause. Common reasons include menstrual loss (in women), bowel loss (with ulcers or bowel cancer) and a diet low in iron (vegetarians and vegans). Iron can be replaced with supplements.",
      "High iron or ferritin may indicate iron overload due to haemochromatosis, a genetic condition affecting iron metabolism. Ferritin is also often raised during inflammation or acute infection. High levels (over 400) should be repeated by your GP to see if they stay raised, which would warrant further testing for haemochromatosis.",
    ],
    limitations: [], abnormal: [],
    link: "",
  },
  vitamins_minerals: {
    key: "vitamins_minerals", title: "Essential Vitamins and Minerals", drafted: true,
    what: ["Vitamin D, vitamin B12 and folate are needed for healthy bones, nerves and blood. Calcium, magnesium and phosphate are minerals that support bones, muscles and nerves. Low vitamin D is common in Ireland, especially in winter."],
    limitations: ["Levels vary with season, diet, supplements and recent illness. One result is a snapshot."],
    abnormal: ["Your GP can advise whether a supplement or a repeat test is needed. Our doctor will specify any follow-up in your advice section."],
    link: "",
  },
  cancer: {
    key: "cancer", title: "Cancer Screening", drafted: false,
    what: [
      "It is vital to detect cancer at an early stage so that the chance of a curative treatment is high. Some cancers have symptoms you can notice by being aware of your body, eg a lump or a change in the size of a body part. Other cancers have a simple test that can detect early changes needing further investigation, eg blood in the stool or abnormal cells on a cervical sample.",
      "Our questions assess your self-awareness and your participation in national screening programmes where they are offered. If you are concerned about any symptom or test result, arrange a consultation with your own GP to discuss it in the context of your own medical history. The screening questions depend on your age and gender.",
    ],
    limitations: [], abnormal: [], link: "",
  },
  bowel: {
    key: "bowel", title: "Bowel Cancer", drafted: false,
    what: ["Bowel (colon) cancer risk increases with a close family history and may also be associated with a diet low in fibre and/or high in red meat. Symptoms tend to present late and may include a change in bowel habit, blood in the stools or unintentional weight loss. The national screening programme tests for blood in the stools for those over 60. Our screening test includes those over 50 or those with the risk factors above."],
    limitations: ["Without risk factors, a positive FIT result is more likely to be due to a benign reason (haemorrhoids, polyps, infection) than bowel cancer. Proving this needs further testing (rectal examination, colonoscopy)."],
    abnormal: [],
    link: "You can find out more about the national bowel cancer screening programme on the HSE website.",
  },
  prostate: {
    key: "prostate", title: "Prostate Cancer", drafted: false,
    what: [
      "Prostate cancer affects 1 in 12 men at some point in their lives. It is far more common with increasing age and may be more common in men with a close relative (father, brother, son) who had prostate cancer under the age of 60.",
      "Common symptoms of an enlarged prostate include poor pressure when urinating, difficulty starting to urinate and having to urinate again immediately after finishing.",
      "The prostate blood test (PSA) may indicate an increased risk of prostate cancer and is recommended for men over 45 who also have a family history or symptoms of prostate enlargement. An abnormal PSA does not necessarily mean prostate cancer: it may also be raised in other conditions affecting the prostate, such as infection or benign prostatic hypertrophy.",
      "Acceptable PSA results are: under 50 years, less than 2 ug/L; 50 to 60 years, less than 3 ug/L; 60 to 70 years, less than 4 ug/L; over 70 years, less than 5 ug/L.",
    ],
    limitations: [], abnormal: [],
    link: "",
  },
  testicular: {
    key: "testicular", title: "Testicular Cancer", drafted: false,
    what: [
      "Testicular cancer is more common in men under 45. Typically one testicle becomes larger than the other, or an irregular lump can be felt within it. If detected early, testicular cancer can be effectively treated and cured.",
      "Examining your testicles is easiest in the shower. Hold a testicle in each hand and compare the size of the left and the right. Then run your fingers around the front and sides of each testicle: it should be smooth, like an egg. Lumps and tubes at the back of the testicle are normal.",
      "If you are worried about a change in size or a lump in your testicle, go to your GP for an examination. Your GP may request an ultrasound scan of your testicle. This is quick and painless and may save your life.",
    ],
    limitations: [], abnormal: [],
    link: "Watch a short video on testicular examination.",
  },
  breast_cervical: {
    key: "breast_cervical", title: "Breast and Cervical Cancer", drafted: true,
    what: ["Breast cancer is most often first noticed as a new lump, a change in the shape or skin of the breast, or a change in the nipple. Cervical screening (a smear test) looks for early changes in the cells of the cervix before they become cancer, and is offered by the national CervicalCheck programme."],
    limitations: ["Self-examination does not replace national screening (BreastCheck mammograms and CervicalCheck smear tests) when you are invited."],
    abnormal: ["If you notice a breast change or an undiagnosed lump, see your GP for an examination. If you are not up to date with cervical screening, contact your GP or CervicalCheck."],
    link: "",
  },
};
