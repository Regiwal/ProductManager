// firebase.js — Firebase configuration & Firestore export
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore }   from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey:            "AIzaSyCX2CPTBMG5Ma-XxYfikiWPAAlCq035Z9s",
  authDomain:        "nsct-8cde8.firebaseapp.com",
  projectId:         "nsct-8cde8",
  storageBucket:     "nsct-8cde8.firebasestorage.app",
  messagingSenderId: "422182586021",
  appId:             "1:422182586021:web:4f71b4420a9797746eaf4c",
  measurementId:     "G-3QP4X56NYG"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
