#!/bin/bash

# This script will print out the README instructions for setting up the Pulumi project.

cat << "EOF"
AWS Infrastructure with Pulumi

This Pulumi project is designed to provision a set of AWS resources for cloud infrastructure, including a VPC, subnets, an internet gateway, route tables, and security groups, along with an EC2 instance and an RDS instance.

Prerequisites
Before deploying this infrastructure, you'll need:

Node.js installed on your local machine.
The Pulumi CLI installed.
The AWS CLI installed and configured with your credentials.
A Pulumi account configured to store your state Pulumi Service or self-hosted.

Configuration
1. Clone the repository:
   Start by cloning this repository to your local machine.

2. Install dependencies:
   Navigate to the cloned directory and run:
   npm install

3. Configuration File:
   Create a YAML configuration file named Pulumi.<stack>.yaml in the root directory of your project with the following structure:
   config:
     iac-pulumi:vpc_name: "vpc-name"
     iac-pulumi:vpc_cidrBlock: "10.0.0.0/16"
   Replace the placeholder values with your specific configurations.

4. Set AWS Region (optional):
   Set the AWS region for Pulumi if not using the default region in AWS CLI:
   pulumi config set aws:region <your-region>

Deployment
1. Log in to Pulumi:
   pulumi login

2. Select Stack:
   If you have not already created a stack for this project, create one with:
   pulumi stack init <stack-name>

3. Preview Changes:
   Run a preview to see the changes that will be made:
   pulumi preview

4. Deploy Infrastructure:
   Deploy your infrastructure with:
   pulumi up
   Confirm the deployment when prompted.

Stack Outputs
The Pulumi program may have outputs that you can export as follows:
pulumi stack output

These outputs are helpful for connecting to and managing your AWS resources.

Cleanup
To destroy the AWS resources managed by this stack, run the following command and confirm the prompt:
pulumi destroy

Notes
- The EC2 instance is configured with user data to bootstrap the application environment.
- The RDS instance is set up with a parameter and subnet group, and it's attached to a security group allowing access from the application security group.
- This project is set up to use AWS Route 53 for DNS configuration.

For more information on how to customize your infrastructure, refer to the Pulumi Documentation.


# Importing SSL Certificate to AWS ACM

## Overview

This guide provides instructions on how to import an SSL certificate into AWS Certificate Manager (ACM) using the AWS CLI. This can be useful, for example, when obtaining a certificate from an external vendor.

## Prerequisites

Before you begin, make sure you have the following:

- AWS CLI installed and configured with the necessary permissions.

## Steps

### 1. Obtain SSL Certificate Files

Ensure you have the necessary SSL certificate files ready. The command below assumes the following files are available:

- demo_mihirsheth_me.crt: The SSL certificate.
- mihirprivatekey.pem: The private key corresponding to the certificate.
- demo_mihirsheth_me.ca-bundle: The certificate chain.

### 2. Run ACM Import Certificate Command

Use the following AWS CLI command to import the SSL certificate into AWS ACM:

aws acm import-certificate \
  --certificate fileb:///Users/mihirsheth/Documents/Certificate/demo_mihirsheth_me/demo_mihirsheth_me.crt \
  --private-key fileb:///Users/mihirsheth/Documents/Certificate/mihirprivatekey.pem \
  --certificate-chain fileb:///Users/mihirsheth/Documents/Certificate/demo_mihirsheth_me/demo_mihirsheth_me.ca-bundle


