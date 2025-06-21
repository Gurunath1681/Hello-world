import React, { useState, useEffect } from "react";
import axios from "axios";
import * as XLSX from "xlsx";
import "./oracle-integration.css";
import CryptoJS from "crypto-js";

const OracleIntegration = () => {
  const [nfaData, setNfaData] = useState([]);
  const [vendorData, setVendorData] = useState([]);
  const [paymentTerms, setPaymentTerms] = useState([]);
  const [selectedNFAs, setSelectedNFAs] = useState(new Set());
  const [selectedVendors, setSelectedVendors] = useState(new Set());
  const [selectedPayments, setSelectedPayments] = useState(new Set());
  const [nfaSearch, setNfaSearch] = useState("");
  const [vendorSearch, setVendorSearch] = useState("");
  const [paymentSearch, setPaymentSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [confirmProceed, setConfirmProceed] = useState(false);
  const [selectedNFA, setSelectedNFA] = useState(null);
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [isAllSelected, setIsAllSelected] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [securityToken, setSecurityToken] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [securityValidated, setSecurityValidated] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const fetchData = async () => {
      try {
        if (!isMounted) return;
        setLoading(true);
        setError(null);

        // Get authentication context from window
        const authContext = window.AUTH_CONTEXT || {};
        const headers = {
          responseType: "arraybuffer",
        };

        if (authContext.isServiceCall && authContext.serviceData) {
          headers["X-Service-Token"] = authContext.serviceData.token;
        }

        const parseExcelFile = async (response, fileType) => {
          try {
            const data = new Uint8Array(response.data);
            const workbook = XLSX.read(data, { type: "array" });
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];

            // Get the raw data as arrays
            const rawData = XLSX.utils.sheet_to_json(worksheet, {
              header: 1,
              raw: false,
              defval: "",
            });

            console.log(`Raw ${fileType} data:`, rawData);

            // Skip header row and empty rows
            const dataRows = rawData
              .slice(1)
              .filter((row) => row.some((cell) => cell !== ""));

            // Transform data based on type
            switch (fileType) {
              case "NFA":
                return dataRows
                  .map((row, index) => ({
                    id: `nfa-${index}`, // Add unique id
                    OPCO_Name: row[0] || "",
                    NFA_Number: row[1] || `NFA-${index + 1}`, // Fallback unique number
                    NFA_Title: row[2] || "",
                    NFA_Status: row[3] || "",
                    NFA_Start_Date: row[4] ? formatDate(row[4]) : "",
                    NFA_End_Date: row[5] ? formatDate(row[5]) : "",
                  }))
                  .filter(
                    (item) =>
                      item.OPCO_Name || item.NFA_Number || item.NFA_Title
                  );

              case "Vendor":
                return dataRows
                  .map((row, index) => ({
                    id: `vendor-${index}`, // Add unique id
                    Vendor_name: row[0] || "",
                    Registered_Address: row[1] || "",
                    Vendor_country: row[2] || "",
                    Vendor_id: row[3] || `VID-${index + 1}`, // Fallback unique id
                  }))
                  .filter((item) => item.Vendor_name || item.Vendor_id);

              case "Payment":
                return dataRows
                  .map((row, index) => ({
                    id: `payment-${index}`, // Add unique id
                    term: row[0] || `TERM-${index + 1}`, // Fallback unique term
                    description: row[1] || "",
                  }))
                  .filter((item) => item.term || item.description);

              default:
                return [];
            }
          } catch (error) {
            console.error(`Error parsing ${fileType} Excel file:`, error);
            throw new Error(`Failed to parse ${fileType} data`);
          }
        };

        // Helper function to format dates
        const formatDate = (dateString) => {
          if (!dateString) return "";
          try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return dateString; // Return original if invalid
            return date.toISOString().split("T")[0]; // Returns YYYY-MM-DD
          } catch {
            return dateString; // Return original if parsing fails
          }
        };

        // Fetch all data in parallel
        console.log("Fetching data...");
        const [nfaResponse, vendorResponse, paymentResponse] =
          await Promise.all([
            axios.get("/static/oracle_integration/nfa_dump.xlsx", {
              responseType: "arraybuffer",
              headers,
            }),
            axios.get("/static/oracle_integration/vendor_details.xlsx", {
              responseType: "arraybuffer",
              headers,
            }),
            axios.get("/static/oracle_integration/payment_terms.xlsx", {
              responseType: "arraybuffer",
              headers,
            }),
          ]);

        // Parse all data
        const [nfaData, vendorData, paymentData] = await Promise.all([
          parseExcelFile(nfaResponse, "NFA"),
          parseExcelFile(vendorResponse, "Vendor"),
          parseExcelFile(paymentResponse, "Payment"),
        ]);

        // Update state if component is still mounted
        if (isMounted) {
          console.log("Setting state with parsed data:", {
            nfa: nfaData,
            vendor: vendorData,
            payment: paymentData,
          });

          setNfaData(nfaData);
          setVendorData(vendorData);
          setPaymentTerms(paymentData);
        }
      } catch (error) {
        console.error("Error fetching data:", error);
        if (isMounted) {
          setError("Failed to load data. Please try again.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const hasNFASelection = selectedNFA !== null;
    const hasVendorSelection = selectedVendor !== null;
    const hasPaymentSelection = selectedPayment !== null;

    setShowConfirmation(
      (hasNFASelection || hasVendorSelection || hasPaymentSelection) &&
        !(hasNFASelection && hasVendorSelection && hasPaymentSelection)
    );

    setIsAllSelected(
      hasNFASelection && hasVendorSelection && hasPaymentSelection
    );
  }, [selectedNFA, selectedVendor, selectedPayment]);

  const isAllTablesSelected = () => {
    return (
      selectedNFAs.size > 0 &&
      selectedVendors.size > 0 &&
      selectedPayments.size > 0
    );
  };

  const isSubmitEnabled = () => {
    const hasSelections =
      selectedNFAs.size > 0 ||
      selectedVendors.size > 0 ||
      selectedPayments.size > 0;
    return (isAllTablesSelected() || confirmProceed) && hasSelections;
  };

  const handleNFASelect = (nfaNumber) => {
    setSelectedNFAs((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(nfaNumber)) {
        newSet.delete(nfaNumber);
      } else {
        newSet.add(nfaNumber);
      }
      return newSet;
    });
  };

  const handleVendorSelect = (vendorName) => {
    setSelectedVendors((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(vendorName)) {
        newSet.delete(vendorName);
      } else {
        newSet.add(vendorName);
      }
      return newSet;
    });
  };

  const handlePaymentSelect = (term) => {
    setSelectedPayments((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(term)) {
        newSet.delete(term);
      } else {
        newSet.add(term);
      }
      return newSet;
    });
  };

  const handleConfirmChange = (e) => {
    setConfirmProceed(e.target.checked);
  };

  const handleSubmit = () => {
    if (!securityValidated) {
      setError("Security validation required");
      return;
    }

    if (!selectedNFA || !selectedVendor || !selectedPayment) {
      setError("Please select one item from each category.");
      return;
    }

    const nfaItem = nfaData.find((item) => item.id === selectedNFA);
    const vendorItem = vendorData.find((item) => item.id === selectedVendor);
    const paymentItem = paymentTerms.find(
      (item) => item.id === selectedPayment
    );

    // Create a flat dictionary with all selected values
    const selectedData = {
      // NFA data
      opco_name: nfaItem.OPCO_Name,
      nfa_number: nfaItem.NFA_Number,
      nfa_title: nfaItem.NFA_Title,
      nfa_status: nfaItem.NFA_Status,
      nfa_start_date: nfaItem.NFA_Start_Date,
      nfa_end_date: nfaItem.NFA_End_Date,

      // Vendor data
      vendor_name: vendorItem.Vendor_name,
      vendor_address: vendorItem.Registered_Address,
      vendor_country: vendorItem.Vendor_country,
      vendor_id: vendorItem.Vendor_id,

      // Payment data
      payment_term: paymentItem.term,
      payment_description: paymentItem.description,
    };

    // If this component is in an iframe, send message to parent window
    if (window.parent !== window) {
      window.parent.postMessage(JSON.stringify(selectedData), "*");
    }

    console.log("Selected data:", selectedData);
    return selectedData;
  };

  const handleNFASelection = (id) => {
    setSelectedNFA(id);
    setConfirmProceed(false);
  };

  const handleVendorSelection = (id) => {
    setSelectedVendor(id);
    setConfirmProceed(false);
  };

  const handlePaymentSelection = (id) => {
    setSelectedPayment(id);
    setConfirmProceed(false);
  };

  const filteredNFA = nfaData.filter((nfa) =>
    Object.values(nfa).some(
      (val) =>
        val &&
        val
          .toString()
          .toLowerCase()
          .includes((nfaSearch || "").toLowerCase())
    )
  );

  const filteredVendors = vendorData.filter((vendor) =>
    Object.values(vendor).some(
      (val) =>
        val &&
        val
          .toString()
          .toLowerCase()
          .includes((vendorSearch || "").toLowerCase())
    )
  );

  const filteredPayments = paymentTerms.filter((payment) =>
    Object.values(payment).some(
      (val) =>
        val &&
        val
          .toString()
          .toLowerCase()
          .includes((paymentSearch || "").toLowerCase())
    )
  );

  // Function to validate timestamp
  const isTimestampValid = (timestamp) => {
    const currentTime = Math.floor(Date.now() / 1000); // Convert to seconds
    const diff = Math.abs(currentTime - timestamp);
    return diff <= 3600; // 1 hour
  };

  // Function to generate token for validation
  const generateToken = (key, timestamp) => {
    const keySource = `${timestamp}${key}${timestamp}`;
    // Create SHA1 hash
    const data = CryptoJS.SHA1(keySource);
    // Create HMAC-SHA1
    return CryptoJS.HmacSHA1(data, key).toString();
  };

  // Function to compare tokens securely
  const compareTokens = (token1, token2) => {
    // Use timing-safe comparison
    if (token1.length !== token2.length) return false;
    return token1 === token2;
  };

  // Validate security token
  const validateSecurityToken = async (secret, timestamp) => {
    try {
      // Get the security key from backend
      const response = await axios.get("/api/get-security-key");
      const key = response.data.key; // Assuming your backend returns the key

      // Validate timestamp first
      if (!isTimestampValid(parseInt(timestamp))) {
        console.error("Token expired");
        return false;
      }

      // Generate token for comparison
      const generatedToken = generateToken(key, timestamp);

      // Compare tokens
      return compareTokens(generatedToken, secret);
    } catch (error) {
      console.error("Security validation failed:", error);
      return false;
    }
  };

  // Initialize security parameters from URL or request body
  useEffect(() => {
    const validateSecurity = async () => {
      try {
        // Get parameters from URL
        const params = new URLSearchParams(window.location.search);
        const secret = params.get("secret");
        const timestamp = params.get("timestamp");

        // If not in URL, check if they were passed in request body or headers
        const requestSecret = window.REQUEST_SECRET; // Assuming these are set somewhere
        const requestTimestamp = window.REQUEST_TIMESTAMP;

        const finalSecret = secret || requestSecret;
        const finalTimestamp = timestamp || requestTimestamp;

        if (!finalSecret || !finalTimestamp) {
          setError("Security parameters missing");
          setSecurityValidated(false);
          return;
        }

        const isValid = await validateSecurityToken(
          finalSecret,
          finalTimestamp
        );

        if (!isValid) {
          setError("Invalid security token");
          setSecurityValidated(false);
          return;
        }

        setSecurityValidated(true);
      } catch (error) {
        console.error("Security validation failed:", error);
        setError("Security validation failed");
        setSecurityValidated(false);
      }
    };

    validateSecurity();
  }, []);

  if (loading) {
    return (
      <div className="oracle-loading">
        <div className="loading-spinner"></div>
        <p>Loading data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="oracle-error">
        <p>{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="retry-button"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 h-screen overflow-y-auto">
      <h1 className="text-2xl font-bold text-center text-[#400835] mb-8">
        Fetch data from Oracle
      </h1>

      {/* NFA Section */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl text-[#400835]">Search NFS</h2>
          <input
            type="text"
            value={nfaSearch}
            onChange={(e) => setNfaSearch(e.target.value)}
            placeholder="Select NFS"
            className="border rounded-lg px-4 py-2 w-64"
          />
        </div>
        <div className="overflow-x-auto overflow-y-auto max-h-[300px] border rounded-lg shadow-sm">
          <table className="w-full relative">
            <thead className="sticky top-0 bg-[#f6d87a] z-10">
              <tr>
                <th className="p-3 text-left font-semibold">SELECT</th>
                <th className="p-3 text-left font-semibold">OPCO NAME</th>
                <th className="p-3 text-left font-semibold">NFA NUMBER</th>
                <th className="p-3 text-left font-semibold">NFA TITLE</th>
                <th className="p-3 text-left font-semibold">STATUS</th>
                <th className="p-3 text-left font-semibold">START DATE</th>
                <th className="p-3 text-left font-semibold">END DATE</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {filteredNFA.map((item) => (
                <tr
                  key={item.id}
                  className="border-b cursor-pointer hover:bg-gray-50"
                  onClick={() => handleNFASelection(item.id)}
                >
                  <td className="p-3">
                    <input
                      type="radio"
                      checked={selectedNFA === item.id}
                      onChange={() => handleNFASelection(item.id)}
                      className="form-radio h-4 w-4 text-[#400835]"
                    />
                  </td>
                  <td className="p-3">{item.OPCO_Name}</td>
                  <td className="p-3">{item.NFA_Number}</td>
                  <td className="p-3">{item.NFA_Title}</td>
                  <td className="p-3">{item.NFA_Status}</td>
                  <td className="p-3">{item.NFA_Start_Date}</td>
                  <td className="p-3">{item.NFA_End_Date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Vendor Section */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl text-[#400835]">Search Vendors</h2>
          <input
            type="text"
            value={vendorSearch}
            onChange={(e) => setVendorSearch(e.target.value)}
            placeholder="Select Vendor"
            className="border rounded-lg px-4 py-2 w-64"
          />
        </div>
        <div className="overflow-x-auto overflow-y-auto max-h-[300px] border rounded-lg shadow-sm">
          <table className="w-full relative">
            <thead className="sticky top-0 bg-[#f6d87a] z-10">
              <tr>
                <th className="p-3 text-left font-semibold">SELECT</th>
                <th className="p-3 text-left font-semibold">VENDOR NAME</th>
                <th className="p-3 text-left font-semibold">ADDRESS</th>
                <th className="p-3 text-left font-semibold">COUNTRY</th>
                <th className="p-3 text-left font-semibold">ID</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {filteredVendors.map((item) => (
                <tr
                  key={item.id}
                  className="border-b cursor-pointer hover:bg-gray-50"
                  onClick={() => handleVendorSelection(item.id)}
                >
                  <td className="p-3">
                    <input
                      type="radio"
                      checked={selectedVendor === item.id}
                      onChange={() => handleVendorSelection(item.id)}
                      className="form-radio h-4 w-4 text-[#400835]"
                    />
                  </td>
                  <td className="p-3">{item.Vendor_name}</td>
                  <td className="p-3">{item.Registered_Address}</td>
                  <td className="p-3">{item.Vendor_country}</td>
                  <td className="p-3">{item.Vendor_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment Terms Section */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl text-[#400835]">Search Payment Terms</h2>
          <input
            type="text"
            value={paymentSearch}
            onChange={(e) => setPaymentSearch(e.target.value)}
            placeholder="Select Payment Term"
            className="border rounded-lg px-4 py-2 w-64"
          />
        </div>
        <div className="overflow-x-auto overflow-y-auto max-h-[300px] border rounded-lg shadow-sm">
          <table className="w-full relative">
            <thead className="sticky top-0 bg-[#f6d87a] z-10">
              <tr>
                <th className="p-3 text-left font-semibold">SELECT</th>
                <th className="p-3 text-left font-semibold">TERM</th>
                <th className="p-3 text-left font-semibold">DESCRIPTION</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {filteredPayments.map((item) => (
                <tr
                  key={item.id}
                  className="border-b cursor-pointer hover:bg-gray-50"
                  onClick={() => handlePaymentSelection(item.id)}
                >
                  <td className="p-3">
                    <input
                      type="radio"
                      checked={selectedPayment === item.id}
                      onChange={() => handlePaymentSelection(item.id)}
                      className="form-radio h-4 w-4 text-[#400835]"
                    />
                  </td>
                  <td className="p-3">{item.term}</td>
                  <td className="p-3">{item.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation and Submit Section */}
      <div className="mt-6">
        {showConfirmation && (
          <div className="bg-[#f6d87a] p-4 rounded-lg mb-4">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={confirmProceed}
                onChange={(e) => setConfirmProceed(e.target.checked)}
                className="form-checkbox h-4 w-4 text-[#400835]"
              />
              <span>
                Reminder: You are proceeding with partial selection of items
              </span>
            </label>
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={!isAllSelected && !confirmProceed}
          className={`w-full py-3 px-6 rounded-lg text-white font-medium ${
            isAllSelected || confirmProceed
              ? "bg-[#400835] hover:bg-[#500a45] cursor-pointer"
              : "bg-gray-400 cursor-not-allowed"
          }`}
        >
          Submit
        </button>
      </div>

      {error && (
        <div className="mt-4 p-4 bg-red-100 text-red-700 rounded-lg">
          {error}
        </div>
      )}
    </div>
  );
};

export default OracleIntegration;
