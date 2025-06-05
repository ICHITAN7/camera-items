import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
// No Firebase Auth imports needed for this version
import { getFirestore, collection, addDoc, doc, deleteDoc, onSnapshot, query, serverTimestamp, updateDoc, arrayUnion } from 'firebase/firestore';
import { Trash2, Edit3, PlusCircle, LogIn, LogOut, Camera as CameraIcon, RefreshCw, AlertTriangle, CheckCircle, XCircle, UserSquare, ImageOff, Package, History, ListChecks, MinusCircle } from 'lucide-react';
import './index.css';
// --- Firebase Configuration ---
const firebaseConfig = {
  apiKey: "AIzaSyDNx92o-Y1uO8UlzGg7KaiYaxPLkC-mLhA",
  authDomain: "smarthome-860ef.firebaseapp.com",
  projectId: "smarthome-860ef",
  storageBucket: "smarthome-860ef.appspot.com",
  messagingSenderId: "829069748994",
  appId: "1:829069748994:web:470c9c09caf51eda2cf01b"
};

const defaultAppId = firebaseConfig.projectId ? `${firebaseConfig.projectId}-camera-inventory-no-auth` : 'default-camera-inventory-app-history-no-auth';
// eslint-disable-next-line no-undef
const appId = typeof __app_id !== 'undefined' ? __app_id : defaultAppId;

// --- Item Categories ---
const itemCategories = [
    "Camera", "Lens", "Filter", "Memory", "Battery", "Charger", 
    "Music License", "Storage", "Case SSD", "Camera Bag", "Tripod", 
    "Gimbal", "Lighting", "Audio", "Drone", "Computer", "Software", "Other"
].sort();


// --- Main App Component ---
function App() {
    const [db, setDb] = useState(null);
    // User state and auth state removed for no-auth version

    const [items, setItems] = useState([]);
    const [isLoading, setIsLoading] = useState(true); 
    const [error, setError] = useState(null);

    const [showAddItemModal, setShowAddItemModal] = useState(false);
    const [showEditItemModal, setShowEditItemModal] = useState(false);
    const [showConfirmDeleteModal, setShowConfirmDeleteModal] = useState(false);
    const [showCheckoutModal, setShowCheckoutModal] = useState(false);
    const [showCheckinModal, setShowCheckinModal] = useState(false);
    const [showHistoryModal, setShowHistoryModal] = useState(false);

    const [itemToEdit, setItemToEdit] = useState(null);
    const [itemToDelete, setItemToDelete] = useState(null);
    const [itemToTransact, setItemToTransact] = useState(null);

    const initialFormState = {
        category: itemCategories[0], name: '', model: '', description: '', imageUrl: '', totalQuantity: 1,
    };
    const [formState, setFormState] = useState(initialFormState);
    
    const [transactionUserName, setTransactionUserName] = useState(''); // For manual name entry
    const [transactionQuantity, setTransactionQuantity] = useState(1);

    const [searchTerm, setSearchTerm] = useState('');

    // Initialize Firebase
    useEffect(() => {
        try {
            if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
                setError("Firebase config missing."); setIsLoading(false); return;
            }
            const app = initializeApp(firebaseConfig);
            const firestoreDb = getFirestore(app);
            setDb(firestoreDb);
            setIsLoading(false); 
        } catch (e) {
            console.error("Firebase initialization error:", e);
            setError("Failed to initialize Firebase."); setIsLoading(false);
        }
    }, []);

    // Firestore Collection Path
    const getEquipmentCollectionPath = useCallback(() => `artifacts/${appId}/public/data/equipment`, []);

    // Fetch Items
    useEffect(() => {
        if (!db) { 
            return;
        }
        
        setIsLoading(true); 
        const path = getEquipmentCollectionPath();
        if (!path) { setError("Config error: Collection path undefined."); setIsLoading(false); return; }
        
        const q = query(collection(db, path));
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const itemsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            itemsData.sort((a, b) => {
                if (a.category < b.category) return -1;
                if (a.category > b.category) return 1;
                return a.name.localeCompare(b.name);
            });
            setItems(itemsData);
            setIsLoading(false); setError(null);
        }, (err) => {
            console.error("Error fetching items:", err);
            setError(`Failed to fetch items: ${err.message}. Path: ${path}`); setIsLoading(false);
        });
        return () => unsubscribe();
    }, [db, getEquipmentCollectionPath]);

    const handleFormChange = (e) => { 
        const { name, value, type } = e.target;
        setFormState(prev => ({ ...prev, [name]: type === 'number' ? parseInt(value, 10) || 0 : value }));
    };
    const handleEditFormChange = (e) => { 
        const { name, value, type } = e.target;
        setItemToEdit(prev => ({ ...prev, [name]: type === 'number' ? parseInt(value, 10) || 0 : value }));
    };

    // --- CRUD Operations ---
    const handleAddItem = async () => {
        if (!db) { setError("DB not ready."); return; }
        if (!formState.name.trim() || !formState.category) { setError("Name & category required."); return; }
        if (formState.totalQuantity < 1) { setError("Total quantity must be at least 1."); return; }

        try {
            const newItemData = {
                ...formState,
                totalQuantity: Number(formState.totalQuantity),
                availableQuantity: Number(formState.totalQuantity), 
                status: 'available', 
                lastCheckedOutByName: null, 
                lastCheckedOutDate: null, 
                lastCheckedInDate: serverTimestamp(), 
                addedAt: serverTimestamp(),
                transactionHistory: [], 
            };
            await addDoc(collection(db, getEquipmentCollectionPath()), newItemData);
            setFormState(initialFormState); setShowAddItemModal(false); setError(null);
        } catch (e) { console.error("Error adding item:", e); setError(`Failed to add item: ${e.message}`); }
    };

    const handleEditItem = async () => {
        if (!db || !itemToEdit) { setError("DB not ready or no item selected."); return; }
        if (!itemToEdit.name.trim() || !itemToEdit.category) { setError("Name & category required."); return; }
        
        const originalItem = items.find(i => i.id === itemToEdit.id);
        if (!originalItem) { setError("Original item not found for comparison."); return; }
        
        let newAvailableQuantity = Number(itemToEdit.availableQuantity); 
        if (itemToEdit.totalQuantity !== undefined && originalItem.totalQuantity !== undefined && Number(itemToEdit.totalQuantity) !== Number(originalItem.totalQuantity)) {
            const currentlyCheckedOut = Number(originalItem.totalQuantity) - Number(originalItem.availableQuantity);
             newAvailableQuantity = Number(itemToEdit.totalQuantity) - currentlyCheckedOut;
             if (newAvailableQuantity < 0) { 
                 setError("Cannot set total quantity less than currently checked out items. Adjust check-ins first."); 
                 return; 
             }
        }

        try {
            const { id, addedAt, transactionHistory, status, lastCheckedOutByName, lastCheckedOutDate, lastCheckedInDate, ...dataToUpdate } = itemToEdit; 
            const itemRef = doc(db, getEquipmentCollectionPath(), id);
            await updateDoc(itemRef, {
                ...dataToUpdate, 
                totalQuantity: Number(itemToEdit.totalQuantity),
                availableQuantity: newAvailableQuantity,
            });
            setShowEditItemModal(false); setItemToEdit(null); setError(null);
        } catch (e) { console.error("Error updating item:", e); setError(`Failed to update item: ${e.message}`); }
    };

    const handleDeleteItem = async () => {
        if (!db || !itemToDelete) { setError("DB not ready or no item selected."); return; }
        try {
            await deleteDoc(doc(db, getEquipmentCollectionPath(), itemToDelete.id));
            setShowConfirmDeleteModal(false); setItemToDelete(null); setError(null);
        } catch (e) { console.error("Error deleting item:", e); setError(`Failed to delete item: ${e.message}`); }
    };
    
    const updateItemStatusBasedOnQuantity = (currentAvailable, totalQuantity) => { 
        if (currentAvailable >= totalQuantity) return 'available';
        if (currentAvailable <= 0) return 'all_checked_out';
        return 'partially_checked_out';
    };

    const handleTransaction = async (type) => { 
        if (!db || !itemToTransact) { setError("DB not ready or no item selected."); return; }
        if (type === 'checkout' && !transactionUserName.trim()) { setError("User name required for checkout."); return; }
        if (transactionQuantity < 1) { setError("Transaction quantity must be at least 1."); return; }

        const itemRef = doc(db, getEquipmentCollectionPath(), itemToTransact.id);
        let newAvailableQuantity = Number(itemToTransact.availableQuantity);
        let updateDataForTransaction = {};

        if (type === 'checkout') {
            if (transactionQuantity > newAvailableQuantity) {
                setError(`Cannot checkout ${transactionQuantity}. Only ${newAvailableQuantity} available.`); return;
            }
            newAvailableQuantity -= transactionQuantity;
            updateDataForTransaction = {
                lastCheckedOutByName: transactionUserName.trim(),
                lastCheckedOutDate: serverTimestamp(),
            };
        } else { // checkin
            if (transactionQuantity + newAvailableQuantity > Number(itemToTransact.totalQuantity)) {
                setError(`Cannot check in ${transactionQuantity}. Exceeds total of ${itemToTransact.totalQuantity}. Max to check in: ${Number(itemToTransact.totalQuantity) - newAvailableQuantity}`); return;
            }
            newAvailableQuantity += transactionQuantity;
            updateDataForTransaction = {
                lastCheckedInDate: serverTimestamp(),
            };
        }
        
        const newStatus = updateItemStatusBasedOnQuantity(newAvailableQuantity, Number(itemToTransact.totalQuantity));
        const transactionRecord = {
            type,
            userName: transactionUserName.trim() || (type === 'checkin' ? "N/A" : "Unknown"), 
            quantityMoved: Number(transactionQuantity),
            timestamp: new Date(), 
        };

        try {
            await updateDoc(itemRef, {
                ...updateDataForTransaction,
                availableQuantity: newAvailableQuantity,
                status: newStatus,
                transactionHistory: arrayUnion(transactionRecord)
            });
            setShowCheckoutModal(false); setShowCheckinModal(false); 
            setItemToTransact(null); setTransactionUserName(''); setTransactionQuantity(1); setError(null);
        } catch (e) { console.error(`Error ${type} item:`, e); setError(`Failed to ${type} item: ${e.message}`); }
    };

    // --- Modal Handlers ---
    const openAddItemModal = () => { setFormState(initialFormState); setShowAddItemModal(true); };
    const openEditItemModal = (item) => { setItemToEdit({...item}); setShowEditItemModal(true); };
    const openConfirmDeleteModal = (item) => { setItemToDelete(item); setShowConfirmDeleteModal(true); };
    
    const openCheckoutModal = (item) => { 
        setItemToTransact(item); 
        setTransactionQuantity(1); 
        setTransactionUserName(''); 
        setShowCheckoutModal(true); 
    };
    const openCheckinModal = (item) => { 
        setItemToTransact(item); 
        setTransactionQuantity(1); 
        setTransactionUserName(''); 
        setShowCheckinModal(true); 
    };
    const openHistoryModal = (item) => { setItemToTransact(item); setShowHistoryModal(true); };

    const filteredItems = items.filter(item => { 
        const searchTermLower = searchTerm.toLowerCase();
        return (
            item.name?.toLowerCase().includes(searchTermLower) ||
            item.model?.toLowerCase().includes(searchTermLower) ||
            item.category?.toLowerCase().includes(searchTermLower) ||
            item.description?.toLowerCase().includes(searchTermLower)
        );
    });
    const renderFormField = (id, label, name, type = "text", value, onChange, options = {}) => { 
        return ( <div> <label htmlFor={id} className="block text-sm font-medium text-slate-300 mb-1"> {label} {options.required && <span className="text-red-500">*</span>} </label> {type === "textarea" ? ( <textarea id={id} name={name} value={value} onChange={onChange} rows="3" className="w-full bg-slate-700 text-slate-100 p-2 border border-slate-600 rounded-md outline-none focus:ring-1 focus:ring-sky-500" placeholder={options.placeholder || ''} /> ) : type === "select" ? ( <select id={id} name={name} value={value} onChange={onChange} className="w-full bg-slate-700 text-slate-100 p-2 border border-slate-600 rounded-md outline-none focus:ring-1 focus:ring-sky-500"> {options.optionsArray?.map(opt => <option key={opt} value={opt}>{opt}</option>)} </select> ) : ( <input type={type} id={id} name={name} value={value} onChange={onChange} min={type === "number" ? options.min : undefined} className="w-full bg-slate-700 text-slate-100 p-2 border border-slate-600 rounded-md outline-none focus:ring-1 focus:ring-sky-500" placeholder={options.placeholder || ''} /> )} </div> );
    };
    const getItemDisplayStatus = (item) => { 
        const available = Number(item.availableQuantity);
        const total = Number(item.totalQuantity);
        if (isNaN(available) || isNaN(total)) { return { text: "Status Unknown", color: "gray", Icon: AlertTriangle }; }
        if (available >= total) return { text: "Available", color: "green", Icon: CheckCircle };
        if (available <= 0) return { text: "All Checked Out", color: "red", Icon: XCircle };
        return { text: "Partially Checked Out", color: "yellow", Icon: MinusCircle };
    };

    // --- UI Rendering ---
    if (isLoading && !db && !error) { 
         return ( <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-4 font-inter"> <CameraIcon className="w-16 h-16 text-sky-500 animate-pulse mb-4" /> <p className="text-xl">Initializing...</p> </div> );
    }
    if (error && !db) { 
        return ( <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-4 font-inter"> <AlertTriangle className="w-16 h-16 text-red-500 mb-4" /> <p className="text-xl text-center">Initialization Error</p> <p className="text-slate-400 text-center mb-4 bg-red-900 p-3 rounded-md">{error}</p> <button onClick={() => window.location.reload()} className="mt-6 bg-sky-600 hover:bg-sky-700 text-white font-semibold py-2 px-4 rounded-lg shadow-md flex items-center"> <RefreshCw className="w-4 h-4 mr-2" /> Try Again </button> </div> );
    }
    
    return (
        <div className="min-h-screen bg-slate-900 text-slate-100 p-4 md:p-8 font-inter">
            <header className="mb-8">
                 <div className="flex flex-col sm:flex-row justify-between items-center mb-6 pb-4 border-b border-slate-700">
                    <div className="flex items-center mb-4 sm:mb-0">
                        <CameraIcon className="w-10 h-10 text-sky-500 mr-3" />
                        <h1 className="text-3xl font-bold text-sky-400">Camera Team Inventory</h1>
                    </div>
                     <div className="flex items-center text-sm text-slate-400 bg-slate-800 px-3 py-1.5 rounded-lg">
                        <UserSquare className="w-4 h-4 mr-2 text-sky-500" /> 
                        <span>Shared Inventory ({appId})</span>
                    </div>
                </div>
                {error && ( 
                    <div className="bg-red-800 border border-red-700 text-red-100 px-4 py-3 rounded-lg relative mb-6" role="alert">
                        <strong className="font-bold">Error: </strong>
                        <span className="block sm:inline">{error}</span>
                        <span className="absolute top-0 bottom-0 right-0 px-4 py-3" onClick={() => setError(null)}>
                            <XCircle className="w-5 h-5 text-red-300 hover:text-red-100 cursor-pointer" />
                        </span>
                    </div>
                )}
                <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                    <input type="text" placeholder="Search name, model, category, description..." className="w-full md:w-1/2 bg-slate-800 p-2.5 border border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-sky-500" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                    <button onClick={openAddItemModal} className="w-full md:w-auto bg-sky-600 hover:bg-sky-700 text-white font-semibold py-2.5 px-6 rounded-lg shadow-md flex items-center justify-center" disabled={!db}>
                        <PlusCircle className="w-5 h-5 mr-2" /> Add New Item
                    </button>
                </div>
            </header>

            {isLoading && items.length === 0 && db ? ( 
                 <div className="text-center py-10"><RefreshCw className="w-12 h-12 text-sky-500 animate-spin mx-auto mb-4" /><p>Loading inventory...</p></div>
            ) : !filteredItems.length && !isLoading ? ( 
                <div className="text-center py-10 bg-slate-800 rounded-lg shadow"><CameraIcon className="w-16 h-16 text-slate-600 mx-auto mb-4" /><p className="text-xl">No equipment found.</p>{searchTerm && <p className="text-slate-500 mt-1">Try a different search term.</p>}</div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {filteredItems.map(item => {
                        const displayStatus = getItemDisplayStatus(item);
                        return (
                        <div key={item.id} className={`bg-slate-800 rounded-xl shadow-lg overflow-hidden flex flex-col border-l-4 border-${displayStatus.color}-500`}>
                            {item.imageUrl ? (
                                <img src={item.imageUrl} alt={item.name} className="w-full h-48 object-cover" onError={(e) => { e.target.style.display = 'none'; if(e.target.nextSibling) e.target.nextSibling.style.display = 'flex'; }} />
                            ) : null}
                            <div className={`w-full h-48 bg-slate-700 flex-col items-center justify-center text-slate-500 ${item.imageUrl ? 'hidden' : 'flex'}`} style={{display: item.imageUrl ? 'none' : 'flex'}}>
                                <ImageOff className="w-16 h-16 mb-2" /><span>No Image</span>
                            </div>
                            <div className="p-5 flex-grow flex flex-col">
                                <div className="mb-2"><span className="text-xs bg-sky-700 text-sky-200 px-2 py-0.5 rounded-full font-medium">{item.category}</span></div>
                                <h3 className="text-xl font-semibold text-sky-400 mb-1">{item.name}</h3>
                                {item.model && <p className="text-sm text-slate-400 mb-1">Model: {item.model}</p>}
                                <p className="text-sm text-slate-400 mb-3 break-words min-h-[40px] flex-grow">{item.description || 'No desc.'}</p>
                                
                                <div className="grid grid-cols-2 gap-2 text-xs text-slate-400 mb-3">
                                    <div><Package className="w-3 h-3 inline mr-1" /> Total: <span className="font-semibold text-slate-200">{item.totalQuantity}</span></div>
                                    <div><ListChecks className="w-3 h-3 inline mr-1" /> Available: <span className={`font-semibold text-${displayStatus.color}-400`}>{item.availableQuantity}</span></div>
                                </div>
                                <div className="text-xs text-slate-500 mb-3">Added: {item.addedAt?.toDate ? item.addedAt.toDate().toLocaleDateString() : 'N/A'}</div>

                                <div className={`mt-auto p-3 bg-slate-700/50 rounded-md text-${displayStatus.color}-400`}>
                                    <p className="font-medium flex items-center"><displayStatus.Icon className="w-4 h-4 mr-2"/>Status: {displayStatus.text}</p>
                                    {item.status !== 'available' && item.lastCheckedOutByName && (
                                        <p className="text-xs text-slate-400 mt-1">Last out by: {item.lastCheckedOutByName} on {item.lastCheckedOutDate?.toDate ? item.lastCheckedOutDate.toDate().toLocaleDateString() : 'N/A'}</p>
                                    )}
                                </div>
                            </div>
                            <div className="bg-slate-700/30 px-5 py-3 flex justify-around items-center gap-1"> {/* Reduced gap for tighter packing */}
                                <button onClick={() => openCheckoutModal(item)} title="Check Out" className="flex flex-col items-center p-2 rounded-lg hover:bg-yellow-600/30 text-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed" disabled={!db || Number(item.availableQuantity) <= 0}>
                                    <LogOut className="w-5 h-5" />
                                    <span className="text-xs mt-1">Out</span>
                                </button>
                                <button onClick={() => openCheckinModal(item)} title="Check In" className="flex flex-col items-center p-2 rounded-lg hover:bg-green-600/30 text-green-400 disabled:opacity-50 disabled:cursor-not-allowed" disabled={!db || Number(item.availableQuantity) >= Number(item.totalQuantity)}>
                                    <LogIn className="w-5 h-5" />
                                    <span className="text-xs mt-1">In</span>
                                </button>
                                <button onClick={() => openHistoryModal(item)} title="View History" className="flex flex-col items-center p-2 rounded-lg hover:bg-purple-600/30 text-purple-400" disabled={!db}>
                                    <History className="w-5 h-5" />
                                    <span className="text-xs mt-1">History</span>
                                </button>
                                <button onClick={() => openEditItemModal(item)} title="Edit Item" className="flex flex-col items-center p-2 rounded-lg hover:bg-blue-600/30 text-blue-400" disabled={!db}>
                                    <Edit3 className="w-5 h-5" />
                                    <span className="text-xs mt-1">Edit</span>
                                </button>
                                <button onClick={() => openConfirmDeleteModal(item)} title="Delete Item" className="flex flex-col items-center p-2 rounded-lg hover:bg-red-600/30 text-red-400" disabled={!db}>
                                    <Trash2 className="w-5 h-5" />
                                    <span className="text-xs mt-1">Delete</span>
                                </button>
                            </div>
                        </div>
                    )})}
                </div>
            )}

            {/* Add/Edit Item Modal */}
            {(showAddItemModal || (showEditItemModal && itemToEdit)) && (
                <Modal title={showAddItemModal ? "Add New Equipment" : "Edit Equipment"} onClose={() => { setShowAddItemModal(false); setShowEditItemModal(false); setItemToEdit(null); setFormState(initialFormState); }}>
                    <div className="space-y-4">
                        {renderFormField("itemCategory", "Category", "category", "select", showAddItemModal ? formState.category : itemToEdit.category, showAddItemModal ? handleFormChange : handleEditFormChange, { optionsArray: itemCategories, required: true })}
                        {renderFormField("itemName", "Item Name / Brand", "name", "text", showAddItemModal ? formState.name : itemToEdit.name, showAddItemModal ? handleFormChange : handleEditFormChange, { placeholder: "e.g., Sony Alpha a6400", required: true })}
                        {renderFormField("itemModel", "Model", "model", "text", showAddItemModal ? formState.model : itemToEdit.model, showAddItemModal ? handleFormChange : handleEditFormChange, { placeholder: "e.g., ILCE-6400L" })}
                        {renderFormField("itemDescription", "Description", "description", "textarea", showAddItemModal ? formState.description : itemToEdit.description, showAddItemModal ? handleFormChange : handleEditFormChange, { placeholder: "e.g., Kit lens, 2 batteries" })}
                        {renderFormField("itemImageUrl", "Image URL", "imageUrl", "text", showAddItemModal ? formState.imageUrl : itemToEdit.imageUrl, showAddItemModal ? handleFormChange : handleEditFormChange, { placeholder: "https://example.com/image.jpg" })}
                        {renderFormField("itemTotalQuantity", "Total Quantity", "totalQuantity", "number", showAddItemModal ? formState.totalQuantity : itemToEdit.totalQuantity, showAddItemModal ? handleFormChange : handleEditFormChange, { min: 1, required: true })}
                        
                        <div className="flex justify-end gap-3 pt-2">
                            <button onClick={() => { setShowAddItemModal(false); setShowEditItemModal(false); setItemToEdit(null); setFormState(initialFormState);}} className="bg-slate-600 hover:bg-slate-500 text-slate-100 font-medium py-2 px-4 rounded-md">Cancel</button>
                            <button onClick={showAddItemModal ? handleAddItem : handleEditItem} className="bg-sky-600 hover:bg-sky-700 text-white font-semibold py-2 px-4 rounded-md flex items-center">
                                {showAddItemModal ? <><PlusCircle className="w-4 h-4 mr-2"/> Add</> : <><CheckCircle className="w-4 h-4 mr-2"/> Save</>}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
            
            {/* Transaction Modals (Checkout/Checkin) */}
            {(showCheckoutModal || showCheckinModal) && itemToTransact && (
                <Modal 
                    title={showCheckoutModal ? `Check Out: ${itemToTransact.name}` : `Check In: ${itemToTransact.name}`} 
                    onClose={() => { setShowCheckoutModal(false); setShowCheckinModal(false); setItemToTransact(null); setTransactionUserName(''); setTransactionQuantity(1);}}
                >
                    <div className="space-y-4">
                        <p className="text-slate-400">Total Owned: {itemToTransact.totalQuantity}, Currently Available: <span className={`font-semibold ${Number(itemToTransact.availableQuantity) > 0 ? 'text-green-400' : 'text-red-400'}`}>{itemToTransact.availableQuantity}</span></p>
                        {renderFormField("transactionUserName", showCheckoutModal ? "Your Name" : "Returned By (Optional)", "userName", "text", transactionUserName, (e) => setTransactionUserName(e.target.value), { placeholder: "Enter your full name", required: showCheckoutModal })}
                        {renderFormField("transactionQuantity", "Quantity to " + (showCheckoutModal ? "Check Out" : "Check In"), "quantity", "number", transactionQuantity, (e) => setTransactionQuantity(Math.max(1, parseInt(e.target.value) || 1)), { min: 1, required: true })}
                        
                        <div className="flex justify-end gap-3 pt-2">
                            <button onClick={() => { setShowCheckoutModal(false); setShowCheckinModal(false); setItemToTransact(null); setTransactionUserName(''); setTransactionQuantity(1);}} className="bg-slate-600 hover:bg-slate-500 text-slate-100 font-medium py-2 px-4 rounded-md">Cancel</button>
                            <button onClick={() => handleTransaction(showCheckoutModal ? 'checkout' : 'checkin')} className={`${showCheckoutModal ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-green-600 hover:bg-green-700'} text-white font-semibold py-2 px-4 rounded-md flex items-center`}>
                                {showCheckoutModal ? <><LogOut className="w-4 h-4 mr-2"/> Confirm Checkout</> : <><LogIn className="w-4 h-4 mr-2"/> Confirm Checkin</>}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* History Modal */}
            {showHistoryModal && itemToTransact && (
                <Modal title={`History: ${itemToTransact.name}`} onClose={() => { setShowHistoryModal(false); setItemToTransact(null);}}>
                    <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                        {itemToTransact.transactionHistory && itemToTransact.transactionHistory.length > 0 ? (
                            [...itemToTransact.transactionHistory].reverse().map((entry, index) => ( 
                                <div key={index} className={`p-3 rounded-md ${entry.type === 'checkout' ? 'bg-yellow-800/30 border-l-2 border-yellow-500' : 'bg-green-800/30 border-l-2 border-green-500'}`}>
                                    <p className="font-semibold text-sm">
                                        {entry.type === 'checkout' ? 'Checked Out' : 'Checked In'} {entry.quantityMoved} unit(s)
                                    </p>
                                    {entry.userName && entry.userName !== "N/A" && <p className="text-xs text-slate-400">By: {entry.userName}</p>}
                                    <p className="text-xs text-slate-500">
                                        {entry.timestamp?.toDate ? entry.timestamp.toDate().toLocaleString() : (entry.timestamp instanceof Date ? entry.timestamp.toLocaleString() : 'Date not available')}
                                    </p>
                                </div>
                            ))
                        ) : (
                            <p className="text-slate-400">No transaction history for this item.</p>
                        )}
                    </div>
                     <div className="flex justify-end pt-4 mt-2 border-t border-slate-700">
                        <button onClick={() => { setShowHistoryModal(false); setItemToTransact(null);}} className="bg-slate-600 hover:bg-slate-500 text-slate-100 font-medium py-2 px-4 rounded-md">Close</button>
                    </div>
                </Modal>
            )}
            
            {showConfirmDeleteModal && itemToDelete && ( 
                 <Modal title="Confirm Deletion" onClose={() => {setShowConfirmDeleteModal(false); setItemToDelete(null);}}>
                    <p className="text-slate-300 mb-6">Delete: <strong className="text-sky-400">{itemToDelete.name} {itemToDelete.model || ''}</strong>?</p>
                    <div className="flex justify-end gap-3">
                        <button onClick={() => {setShowConfirmDeleteModal(false); setItemToDelete(null);}} className="bg-slate-600 hover:bg-slate-500 text-slate-100 font-medium py-2 px-4 rounded-md">Cancel</button>
                        <button onClick={handleDeleteItem} className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-md flex items-center">
                           <Trash2 className="w-4 h-4 mr-2"/> Delete Item
                        </button>
                    </div>
                </Modal>
            )}


            <footer className="text-center mt-12 py-6 border-t border-slate-700">
                <p className="text-sm text-slate-500">&copy; 2025 HAFIZ X ITY. Camera Team Inventory.</p>
            </footer>
        </div>
    );
}

const Modal = ({ title, children, onClose }) => { 
    useEffect(() => {
        const handleEsc = (event) => { if (event.key === 'Escape') { onClose(); } };
        window.addEventListener('keydown', handleEsc);
        return () => { window.removeEventListener('keydown', handleEsc); };
    }, [onClose]);

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
            <div className="bg-slate-800 rounded-xl shadow-2xl w-full max-w-lg mx-auto transform animate-scaleUp">
                <div className="flex justify-between items-center px-6 py-4 border-b border-slate-700">
                    <h2 className="text-xl font-semibold text-sky-400">{title}</h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-200"><XCircle className="w-6 h-6" /></button>
                </div>
                <div className="p-6 max-h-[70vh] overflow-y-auto">{children}</div>
            </div>
            <style>{`
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes scaleUp { from { opacity: 0.5; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
                .animate-fadeIn { animation: fadeIn 0.3s ease-out forwards; }
                .animate-scaleUp { animation: scaleUp 0.3s ease-out forwards; }
            `}</style>
        </div>
    );
};

export default App;

