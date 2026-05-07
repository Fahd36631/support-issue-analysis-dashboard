import { NavLink, Route, Routes } from "react-router-dom";
import UploadPage from "./UploadPage";
import PreviewPage from "./PreviewPage";
import RegionPage from "./RegionPage";

function TopBar() {
  return (
    <div className="topbar">
      <div className="brand">
        <div className="brand-title">Monthly Support Issue Analysis</div>
        <div className="brand-sub">Upload WhatsApp exports • Review • Edit • Export to Excel</div>
      </div>
      <div className="nav">
        <NavLink to="/" className={({ isActive }) => `pill ${isActive ? "active" : ""}`}>
          Home / Upload
        </NavLink>
        <NavLink to="/preview" className={({ isActive }) => `pill ${isActive ? "active" : ""}`}>
          Analysis Preview
        </NavLink>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <div className="container">
      <TopBar />
      <Routes>
        <Route path="/" element={<UploadPage />} />
        <Route path="/preview" element={<PreviewPage />} />
        <Route path="/region/:regionName" element={<RegionPage />} />
      </Routes>
    </div>
  );
}

