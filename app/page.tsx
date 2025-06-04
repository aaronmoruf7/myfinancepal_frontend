"use client"

import type React from "react"

import { useState } from "react"
import { Upload, Play, DollarSign, TrendingUp, FileText, Users } from "lucide-react"
import { CheckCircle, Loader, Circle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface Transaction {
  id: string
  date: string
  description: string
  amount: number
  category: string
  confidence: number
  is_group: boolean
  is_reimbursement: boolean
}


interface MatchedReimbursement extends Transaction {
  applied_amt: number
  expense_date?: string
  expense_desc?: string
}


interface AnalysisResult {
  categorized: Transaction[]
  matched: MatchedReimbursement[]
  ambiguous: Array<{
    transaction: Transaction
    possibleGroups: string[]
    selectedGroup?: string
  }>
}

interface CategorySummary {
  [category: string]: number
}

export default function Dashboard() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [uploadStatus, setUploadStatus] = useState<string>("")
  const [currentStep, setCurrentStep] = useState(0)


  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    setUploadStatus("")

    try {
      const formData = new FormData()
      formData.append("file", file)

      const response = await fetch("http://127.0.0.1:8000/upload", {
        method: "POST",
        body: formData,
      })

      if (response.ok) {
        const data = await response.json()
        const parsed = data.categorized || []
      
        // Assign unique IDs
        const withIds = parsed.map((t: Transaction, index: number) => ({
          ...t,
          id: `${index}-${t.description}`, // basic unique key
        
        }))
      
        setTransactions(withIds)
        setAnalysisResult(null)
        setUploadStatus(`Successfully uploaded ${data.rows_loaded || 0} transactions`)
        setCurrentStep(1)

      } else {
        setUploadStatus("Upload failed. Please try again.")
      }
    } catch (error) {
      setUploadStatus("Upload failed. Please try again.")
    } finally {
      setIsUploading(false)
    }
  }

  const handleRunAnalysis = async () => {
    setIsAnalyzing(true)
    try {
      const response = await fetch("http://127.0.0.1:8000/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ transactions }),
      })
  
      if (response.ok) {
        const result = await response.json()
        const withIds = (result.categorized || []).map((t: Transaction, index: number) => ({
          ...t,
          id: `${index}-${t.description}`,
        }))
        setAnalysisResult(result)
        setTransactions(withIds)
        // ✅ Step logic based on result
        if ((result?.ambiguous?.length ?? 0) === 0) {
          setCurrentStep(4) // All reimbursements matched
        } else {
          setCurrentStep(3) // Still need to resolve
        }

      }
    } catch (error) {
      console.error("Analysis failed:", error)
    } finally {
      setIsAnalyzing(false)
    }
  }
  

  const updateTransaction = (id: string, field: keyof Transaction, value: any) => {
    setTransactions((prev) => prev.map((t) => (t.id === id ? { ...t, [field]: value } : t)))
  }

  const updateAmbiguousSelection = (index: number, selectedGroup: string) => {
    if (!analysisResult) return;
  
    const updatedAmbiguous = [...analysisResult.ambiguous];
    const resolved = updatedAmbiguous.splice(index, 1)[0];
  
    const matchedTransaction = {
      ...resolved.transaction,
      expense_desc: selectedGroup,
      applied_amt: resolved.transaction.amount,
    };
  
    const newAnalysisResult = {
      ...analysisResult,
      ambiguous: updatedAmbiguous,
      matched: [...analysisResult.matched, matchedTransaction],
    };
  
    setAnalysisResult(newAnalysisResult);
  
    // Moved OUTSIDE setAnalysisResult
    if (updatedAmbiguous.length === 0) {
      setCurrentStep(4);
    }
  };
  
  

  const calculateCategorySummary = (): {
    summaryByCategory: CategorySummary
    totalSpend: number
    totalIncome: number
    netIncome: number
  } => {
    const summary: CategorySummary = {}
    let income = 0
    let spend = 0
  
    const matchedDescriptions = new Set<string>()
    const reimbursedByCategory: { [category: string]: number } = {}
  
    // Phase 1: process matched reimbursements
    if (analysisResult?.matched) {
      for (const matched of analysisResult.matched) {
        const applied = matched.applied_amt || 0
        const category = matched.expense_desc
        ? transactions.find((t) => t.description === matched.expense_desc)?.category || "Uncategorized"
        : "Uncategorized"
  
        reimbursedByCategory[category] = (reimbursedByCategory[category] || 0) + applied
        matchedDescriptions.add(matched.description) // Prevent double-counting in income
      }
    }
  
    // Phase 2: process all transactions
    for (const transaction of transactions) {
      const category = transaction.category || "Uncategorized"
      const amt = transaction.amount
      const isReimb = transaction.is_reimbursement
      const isIncomeType = ["reimbursement", "salary"].includes(category.toLowerCase())
  
      // Only count reimbursements in income if not matched already
      const alreadyMatched = matchedDescriptions.has(transaction.description)
  
      if (isIncomeType && amt > 0 && !alreadyMatched) {
        income += amt
      }
  
      // Count expense only if negative
      if (!isIncomeType && amt < 0) {
        spend += Math.abs(amt)
        summary[category] = (summary[category] || 0) + Math.abs(amt)
      }
  
      // Add income type transactions to summary anyway (e.g. Salary, unmatched Reimbursement)
      if (isIncomeType && amt > 0 && !alreadyMatched) {
        summary[category] = (summary[category] || 0) + amt
      }
    }
  
    // Phase 3: apply reimbursement offsets to group categories
    for (const [category, reimbursedAmount] of Object.entries(reimbursedByCategory)) {
      if (summary[category] !== undefined) {
        summary[category] -= reimbursedAmount
      }      
      spend -= reimbursedAmount
    }
  
    return {
      summaryByCategory: summary,
      totalSpend: Math.max(spend, 0),
      totalIncome: income,
      netIncome: income - spend,
    }
  }
  
  

  const {
    summaryByCategory: categorySummary,
    totalSpend,
    totalIncome,
    netIncome,
  } = calculateCategorySummary()
  
  const steps = [
    { title: "Upload Transactions", key: "upload" },
    { title: "Reconcile Categories", key: "reconcile" },
    { title: "Run Analysis", key: "analyze" },
    { title: "Resolve Matches", key: "resolve" },
  ]

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Sidebar Pipeline */}
      <aside className="w-64 bg-white border-r px-6 py-10 hidden lg:block">
        <div className="space-y-6 sticky top-20">
          {steps.map((step, index) => (
            <div key={step.key} className="flex items-start space-x-2">
              <div className="mt-1">
                {currentStep > index ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : currentStep === index ? (
                  <Loader className="h-5 w-5 text-blue-500 animate-spin" />
                ) : (
                  <Circle className="h-5 w-5 text-gray-300" />
                )}
              </div>
              <div className={index === currentStep ? "text-blue-600 font-medium" : "text-gray-600"}>
                {step.title}
              </div>
            </div>
          ))}
        </div>
      </aside>

      <main className="flex-1">
        <div className="min-h-screen bg-gray-50">
          {/* Header */}
          <div className="bg-white border-b">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-center justify-between h-16">
                <div className="flex items-center space-x-3">
                  <DollarSign className="h-8 w-8 text-blue-600" />
                  <h1 className="text-2xl font-bold text-gray-900">My Finance Pal</h1>
                </div>
                <Badge variant="outline" className="text-sm">
                  {transactions.length} transactions loaded
                </Badge>
              </div>
            </div>
          </div>

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

              {/* Upload Section */}
              <div className="lg:col-span-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Upload className="h-5 w-5" />
                      <span>Upload Transactions</span>
                    </CardTitle>
                    <CardDescription>Upload a CSV file containing your bank transactions</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="file-upload">CSV File</Label>
                        <Input
                          id="file-upload"
                          type="file"
                          accept=".csv"
                          onChange={handleFileUpload}
                          disabled={isUploading}
                          className="mt-1"
                        />
                      </div>
                      {uploadStatus && (
                        <Alert>
                          <AlertDescription>{uploadStatus}</AlertDescription>
                        </Alert>
                      )}
                      {isUploading && (
                        <div className="flex items-center space-x-2 text-sm text-gray-600">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                          <span>Uploading...</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Summary Cards */}
              <div className="lg:col-span-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center space-x-2">
                        <DollarSign className="h-4 w-4 text-green-600" />
                        <span className="text-sm font-medium text-gray-600">Total Income</span>
                      </div>
                      <div className="text-2xl font-bold text-gray-900">${totalIncome.toFixed(2)}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center space-x-2">
                        <TrendingUp className="h-4 w-4 text-red-600" />
                        <span className="text-sm font-medium text-gray-600">Total Spend</span>
                      </div>
                      <div className="text-2xl font-bold text-gray-900">${totalSpend.toFixed(2)}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center space-x-2">
                        <DollarSign className="h-4 w-4 text-blue-600" />
                        <span className="text-sm font-medium text-gray-600">Net Income</span>
                      </div>
                      <div className="text-2xl font-bold text-gray-900">${netIncome.toFixed(2)}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center space-x-2">
                        <Users className="h-4 w-4 text-purple-600" />
                        <span className="text-sm font-medium text-gray-600">Categories</span>
                      </div>
                      <div className="text-2xl font-bold text-gray-900">{Object.keys(categorySummary).length}</div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Transactions Table */}
              <div className="lg:col-span-4">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Transactions</CardTitle>
                        <CardDescription>Review and categorize your transactions</CardDescription>
                      </div>
                      <Button
                        type="button"
                        onClick={handleRunAnalysis}
                        disabled={isAnalyzing}
                        className="flex items-center space-x-2"
                      >
                        {isAnalyzing ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                        <span>{isAnalyzing ? "Analyzing..." : "Run Analysis"}</span>
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {transactions.length > 0 ? (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Date</TableHead>
                              <TableHead>Description</TableHead>
                              <TableHead>Amount</TableHead>
                              <TableHead>Category</TableHead>
                              <TableHead>Confidence</TableHead>
                              <TableHead>Group</TableHead>
                              <TableHead>Reimbursement</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {transactions.map((transaction) => (
                              <TableRow key={transaction.id}>
                                <TableCell>{new Date(transaction.date).toLocaleDateString()}</TableCell>
                                <TableCell className="font-medium">{transaction.description}</TableCell>
                                <TableCell>
                                  <span className={transaction.amount < 0 ? "text-red-600" : "text-green-600"}>
                                    ${Math.abs(transaction.amount).toFixed(2)}
                                  </span>
                                </TableCell>
                                <TableCell>
                                  <Input
                                    value={transaction.category}
                                    onChange={(e) => updateTransaction(transaction.id, "category", e.target.value)}
                                    className="w-32"
                                  />
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    variant={
                                      transaction.confidence > 0.8
                                        ? "default"
                                        : transaction.confidence > 0.5
                                          ? "secondary"
                                          : "destructive"
                                    }
                                  >
                                    {(transaction.confidence * 100).toFixed(0)}%
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <Switch
                                    checked={transaction.is_group}
                                    onCheckedChange={(checked) => updateTransaction(transaction.id, "is_group", checked)}
                                  />
                                </TableCell>
                                <TableCell>
                                  <Badge variant={transaction.is_reimbursement ? "default" : "outline"}>
                                    {transaction.is_reimbursement ? "Yes" : "No"}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <div className="text-center py-12 text-gray-500">
                        <Upload className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                        <p>No transactions uploaded yet</p>
                        <p className="text-sm">Upload a CSV file to get started</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Analysis Results */}
              {analysisResult && (
                <>
                  {/* Matched Reimbursements */}
                  {analysisResult.matched.length > 0 && (
                    <div className="lg:col-span-2">
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-green-600">Matched Reimbursements</CardTitle>
                          <CardDescription>Automatically matched reimbursement transactions</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            {analysisResult.matched.map((transaction) => (
                              <div
                                key={transaction.id}
                                className="flex justify-between items-center p-3 bg-green-50 rounded-lg"
                              >
                                <div>
                                  <p className="font-medium">{transaction.description}</p>
                                  <p className="text-sm text-gray-600">
                                    Category: {transaction.category}
                                    {transaction.expense_desc && (
                                      <>
                                        <br />
                                        Matched to: <span className="font-semibold">{transaction.expense_desc}</span>
                                      </>
                                    )}
                                  </p>
                                </div>
                                <span className="font-bold text-green-600">${Math.abs(transaction.amount).toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  )}

                  {/* Ambiguous Reimbursements */}
                  {analysisResult.ambiguous.length > 0 && (
                    <div className="lg:col-span-2">
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-orange-600">Ambiguous Reimbursements</CardTitle>
                          <CardDescription>Select which group expense these reimbursements apply to</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-4">
                            {analysisResult.ambiguous.map((item, index) => (
                              <div key={item.transaction.id} className="p-4 bg-orange-50 rounded-lg">
                                <div className="flex justify-between items-start mb-3">
                                  <div>
                                    <p className="font-medium">{item.transaction.description}</p>
                                    <p className="text-sm text-gray-600">{item.transaction.category}</p>
                                  </div>
                                  <span className="font-bold text-orange-600">
                                    ${Math.abs(item.transaction.amount).toFixed(2)}
                                  </span>
                                </div>
                                <Select
                                  value={item.selectedGroup || ""}
                                  onValueChange={(value) => updateAmbiguousSelection(index, value)}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select group expense" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {item.possibleGroups.map((group) => (
                                      <SelectItem key={group} value={group}>
                                        {group}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  )}
                </>
              )}

              {/* Category Summary */}
              {Object.keys(categorySummary).length > 0 && (
                <div className="lg:col-span-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Spending by Category</CardTitle>
                      <CardDescription>Breakdown of your expenses by category</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {Object.entries(categorySummary)
                          .sort(([, a], [, b]) => b - a)
                          .map(([category, amount]) => (
                            <div key={category} className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
                              <div>
                                <p className="font-medium">{category}</p>
                                <p className="text-sm text-gray-600">
                                  {((amount / totalSpend) * 100).toFixed(1)}% of total
                                </p>
                              </div>
                              <span className="font-bold text-gray-900">${amount.toFixed(2)}</span>
                            </div>
                          ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
      )
    
    }
