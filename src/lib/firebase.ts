import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, getDocs, query, where, deleteDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
  databaseURL: process.env.FIREBASE_DATABASE_URL,
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

export interface JobListing {
  title: string;
  company: string;
  location?: string;
  requiredExperience?: string;
  requiredSkills?: string[];
  jobUrl?: string;
  postedDate?: string;
  source: "angellist" | "indeed" | "remoteok" | "glassdoor" | "linkedin" | "instahyre";
  fetchedAt?: string;
  externalId?: string;
}

export async function saveJobToFirebase(job: JobListing): Promise<string> {
  try {
    const jobsCollection = collection(db, "jobs");
    const docRef = await addDoc(jobsCollection, {
      ...job,
      fetchedAt: new Date().toISOString(),
    });
    return docRef.id;
  } catch (error) {
    console.error("Error saving job to Firebase:", error);
    throw error;
  }
}

export async function getJobsBySource(source: JobListing["source"]): Promise<JobListing[]> {
  try {
    const jobsCollection = collection(db, "jobs");
    const q = query(jobsCollection, where("source", "==", source));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => doc.data() as JobListing);
  } catch (error) {
    console.error("Error fetching jobs from Firebase:", error);
    throw error;
  }
}

export async function isDuplicateJob(externalId: string, source: JobListing["source"]): Promise<boolean> {
  try {
    const jobsCollection = collection(db, "jobs");
    const q = query(
      jobsCollection,
      where("externalId", "==", externalId),
      where("source", "==", source)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.length > 0;
  } catch (error) {
    console.error("Error checking for duplicate job:", error);
    return false;
  }
}
