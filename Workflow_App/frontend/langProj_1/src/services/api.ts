// api.ts
import axios from "axios";
import { GraphPayload } from "../types/graph";

const BASE_URL = "http://localhost:8001";

export const runGraph = async (payload: GraphPayload) => {
  const res = await axios.post(`${BASE_URL}/graph/run`, payload);
  console.log("res : ",res.data);
  return res.data;
};