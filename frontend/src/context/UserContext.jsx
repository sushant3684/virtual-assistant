import axios from 'axios'
import React, { createContext, useEffect, useRef, useState } from 'react'

export const userDataContext = createContext()

function UserContext({ children }) {
    const serverUrl = "http://localhost:8000"
    const [userData, setUserData] = useState(null)
    const [frontendImage, setFrontendImage] = useState(null)
    const [backendImage, setBackendImage] = useState(null)
    const [selectedImage, setSelectedImage] = useState(null)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState(null)
    
    // Rate limiting state
    const lastRequestTimeRef = useRef(0)
    const MIN_REQUEST_INTERVAL = 2000 // Minimum 2 seconds between requests

    const handleCurrentUser = async () => {
        try {
            const result = await axios.get(`${serverUrl}/api/user/current`, { withCredentials: true })
            setUserData(result.data)
            console.log(result.data)
        } catch (error) {
            console.log(error)
        }
    }

    const getGeminiResponse = async (command) => {
        // Check if we're making requests too quickly
        const now = Date.now()
        const timeSinceLastRequest = now - lastRequestTimeRef.current
        
        if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
            console.log("Please wait before sending another request")
            return {
                type: "error",
                response: "Please wait a moment before sending another request.",
                userInput: command
            }
        }
        
        lastRequestTimeRef.current = now
        setIsLoading(true)
        setError(null)
        
        try {
            const result = await axios.post(
                `${serverUrl}/api/user/asktoassistant`,
                { command },
                { withCredentials: true }
            )
            setIsLoading(false)
            return result.data
        } catch (error) {
            setIsLoading(false)
            console.log("Gemini Response Error:", error)
            
            // Handle 429 rate limit error
            if (error.response?.status === 429) {
                setError("Rate limit exceeded. Please wait a moment.")
                return {
                    type: "error",
                    response: "I'm receiving too many requests. Please wait a moment and try again.",
                    userInput: command
                }
            }
            
            // Handle other errors
            setError("Something went wrong. Please try again.")
            return {
                type: "error",
                response: "Sorry, something went wrong. Please try again.",
                userInput: command
            }
        }
    }

    useEffect(() => {
        handleCurrentUser()
    }, [])
    
    const value = {
        serverUrl,
        userData,
        setUserData,
        backendImage,
        setBackendImage,
        frontendImage,
        setFrontendImage,
        selectedImage,
        setSelectedImage,
        getGeminiResponse,
        isLoading,
        error
    }
    
    return (
        <div>
            <userDataContext.Provider value={value}>
                {children}
            </userDataContext.Provider>
        </div>
    )
}

export default UserContext
